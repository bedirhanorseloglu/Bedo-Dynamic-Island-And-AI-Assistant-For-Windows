const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const MAX_VALID_U32 = 0x7fffffff; // Filter ACPI unknown sentinels (0x80000000, 0xFFFFFFFF)
const MIN_VALID_CHARGE_RATE_MW = 500; // 0.5 W minimum to ignore noise / trickle-off
const MAX_VALID_CHARGE_RATE_MW = 500000; // 500 W upper sanity bound
const MIN_ETA_MINUTES = 1;
const MAX_ETA_MINUTES = 720; // 12 hours upper sanity bound for charging
const MAX_DISCHARGE_ETA_MINUTES = 1440; // 24 hours upper sanity bound for discharging
const MIN_CHARGE_LIMIT_PCT = 40;
const MAX_CHARGE_LIMIT_PCT = 100;

const WMI_QUERY_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$bs = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus)',
  '$bf = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity)',
  '$wb = @(Get-CimInstance -ClassName Win32_Battery)',
  '$fullMap = @{}',
  'foreach ($f in $bf) { if ($f.InstanceName) { $fullMap[$f.InstanceName] = [double]$f.FullChargedCapacity } }',
  '$items = @()',
  'for ($i = 0; $i -lt $bs.Count; $i++) {',
  '  $s = $bs[$i]',
  '  $full = $null',
  '  if ($s.InstanceName -and $fullMap.ContainsKey($s.InstanceName)) { $full = $fullMap[$s.InstanceName] }',
  '  elseif ($i -lt $bf.Count) { $full = [double]$bf[$i].FullChargedCapacity }',
  '  $pct = if ($i -lt $wb.Count) { [double]$wb[$i].EstimatedChargeRemaining } else { $null }',
  '  $estRun = if ($i -lt $wb.Count) { [double]$wb[$i].EstimatedRunTime } else { $null }',
  '  $items += [PSCustomObject]@{',
  '    instanceName = [string]$s.InstanceName',
  '    charging = [bool]$s.Charging',
  '    discharging = [bool]$s.Discharging',
  '    chargeRateMw = [double]$s.ChargeRate',
  '    dischargeRateMw = [double]$s.DischargeRate',
  '    remainingCapacityMwh = [double]$s.RemainingCapacity',
  '    fullChargedCapacityMwh = $full',
  '    percent = $pct',
  '    estimatedRunTimeMin = $estRun',
  '  }',
  '}',
  'if ($items.Count -eq 0 -and $wb.Count -gt 0) {',
  '  foreach ($b in $wb) {',
  '    $isChg = ($b.BatteryStatus -eq 2 -or $b.BatteryStatus -eq 6 -or $b.BatteryStatus -eq 7 -or $b.BatteryStatus -eq 8 -or $b.BatteryStatus -eq 9)',
  '    $items += [PSCustomObject]@{',
  '      instanceName = [string]$b.DeviceID',
  '      charging = $isChg',
  '      discharging = (-not $isChg -and $b.BatteryStatus -eq 1)',
  '      chargeRateMw = 0',
  '      dischargeRateMw = 0',
  '      remainingCapacityMwh = 0',
  '      fullChargedCapacityMwh = 0',
  '      percent = [double]$b.EstimatedChargeRemaining',
  '      estimatedRunTimeMin = [double]$b.EstimatedRunTime',
  '    }',
  '  }',
  '}',
  '$oemLimit = $null',
  '$lenovoKeys = Get-ChildItem "HKLM:\\SOFTWARE\\Lenovo\\PWRMGRV\\ConfKeys\\Data" -ErrorAction SilentlyContinue',
  'foreach ($k in $lenovoKeys) {',
  '  $props = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue',
  '  if ($props.ChargeStopControl -eq 1 -and $props.ChargeStopThreshold -ge 40 -and $props.ChargeStopThreshold -lt 100) {',
  '    $oemLimit = [int]$props.ChargeStopThreshold',
  '    break',
  '  }',
  '}',
  '[PSCustomObject]@{ batteries = @($items); oemChargeLimit = $oemLimit } | ConvertTo-Json -Compress -Depth 4',
].join('\n');

function isValidCapacity(val) {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 && val < MAX_VALID_U32;
}

function isValidRemaining(val) {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val < MAX_VALID_U32;
}

function isValidChargeRate(val) {
  return (
    typeof val === 'number' &&
    Number.isFinite(val) &&
    val >= MIN_VALID_CHARGE_RATE_MW &&
    val <= MAX_VALID_CHARGE_RATE_MW
  );
}

function normalizeTargetPercent(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 100;
  const rounded = Math.round(n);
  if (rounded >= MIN_CHARGE_LIMIT_PCT && rounded <= MAX_CHARGE_LIMIT_PCT) {
    return rounded;
  }
  return 100;
}

/**
 * Reads user-configured battery charge limit from G-Helper if present.
 * Returns null if G-Helper is not installed or has no active limit (< 100%).
 */
function readGHelperChargeLimit(appDataDir = process.env.APPDATA || '') {
  if (!appDataDir) return null;
  try {
    const cfgPath = path.join(appDataDir, 'GHelper', 'config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const json = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Number(json.charge_full) === 1) return 100;
    const limit = Number(json.charge_limit);
    if (Number.isFinite(limit) && limit >= MIN_CHARGE_LIMIT_PCT && limit < 100) {
      return Math.round(limit);
    }
    return 100;
  } catch {
    return null;
  }
}

/**
 * Exact, deterministic sensor-based ETA calculator for single or multi-battery Windows systems.
 * Uses direct hardware Watt-hour / Watt physics (no arbitrary/invented multipliers) and respects
 * active charge limits (e.g. 80% battery health limit).
 *
 * @param {Array<object>|object} batteries
 * @param {{ targetPercent?: number }} [options]
 * @returns {{ status: 'ok'|'full'|'limit-reached'|'unavailable', minutes: number|null, targetPercent: number, chargeRateW: number|null, percent: number|null, source: 'wmi'|'none' }}
 */
function computeBatteryChargeEta(batteries, options = {}) {
  const targetPercent = normalizeTargetPercent(options?.targetPercent);
  const list = Array.isArray(batteries) ? batteries : batteries ? [batteries] : [];
  if (list.length === 0) {
    return {
      status: 'unavailable',
      mode: null,
      minutes: null,
      targetPercent,
      chargeRateW: null,
      dischargeRateW: null,
      percent: null,
      source: 'none',
    };
  }

  let totalFullMwh = 0;
  let totalRemainingMwh = 0;
  let totalChargeRateMw = 0;
  let totalDischargeRateMw = 0;
  let anyCharging = false;
  let anyDischarging = false;
  let validCapacityCount = 0;
  let fallbackPercentSum = 0;
  let fallbackPercentCount = 0;
  let validEstRunTimeMin = null;

  for (const bat of list) {
    if (!bat || typeof bat !== 'object') continue;
    const isCharging = Boolean(bat.charging);
    const isDischarging = !isCharging && Boolean(bat.discharging);
    if (isCharging) anyCharging = true;
    if (isDischarging) anyDischarging = true;

    const full = Number(bat.fullChargedCapacityMwh);
    const rem = Number(bat.remainingCapacityMwh);
    const rate = Number(bat.chargeRateMw);
    const dRate = Number(bat.dischargeRateMw);
    const pct = Number(bat.percent);
    const estRun = Number(bat.estimatedRunTimeMin);

    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      fallbackPercentSum += pct;
      fallbackPercentCount += 1;
    }

    if (isValidCapacity(full) && isValidRemaining(rem)) {
      totalFullMwh += full;
      totalRemainingMwh += Math.min(rem, full);
      validCapacityCount += 1;
    }

    if (isCharging && isValidChargeRate(rate)) {
      totalChargeRateMw += rate;
    }

    if (!isCharging && isValidChargeRate(dRate)) {
      totalDischargeRateMw += dRate;
    }

    if (
      !isCharging &&
      Number.isFinite(estRun) &&
      estRun >= MIN_ETA_MINUTES &&
      estRun <= MAX_DISCHARGE_ETA_MINUTES
    ) {
      validEstRunTimeMin =
        validEstRunTimeMin === null ? Math.round(estRun) : validEstRunTimeMin + Math.round(estRun);
    }
  }

  const computedPercent =
    validCapacityCount > 0 && totalFullMwh > 0
      ? Math.min(100, Math.max(0, Math.round((totalRemainingMwh / totalFullMwh) * 100)))
      : fallbackPercentCount > 0
        ? Math.min(100, Math.max(0, Math.round(fallbackPercentSum / fallbackPercentCount)))
        : null;

  const chargeRateW = totalChargeRateMw > 0 ? Math.round((totalChargeRateMw / 1000) * 10) / 10 : null;
  const dischargeRateW = totalDischargeRateMw > 0 ? Math.round((totalDischargeRateMw / 1000) * 10) / 10 : null;

  // Discharging path (not charging, active discharge rate or WMI runtime estimate)
  if (!anyCharging && (anyDischarging || totalDischargeRateMw > 0 || validEstRunTimeMin !== null)) {
    let minutes = null;
    if (validCapacityCount > 0 && totalRemainingMwh > 0 && totalDischargeRateMw > 0) {
      const computed = Math.round((totalRemainingMwh / totalDischargeRateMw) * 60);
      if (Number.isFinite(computed) && computed >= MIN_ETA_MINUTES && computed <= MAX_DISCHARGE_ETA_MINUTES) {
        minutes = computed;
      }
    }
    if (minutes === null && validEstRunTimeMin !== null && validEstRunTimeMin <= MAX_DISCHARGE_ETA_MINUTES) {
      minutes = validEstRunTimeMin;
    }
    if (minutes !== null) {
      return {
        status: 'ok',
        mode: 'discharging',
        minutes,
        targetPercent: 0,
        chargeRateW: null,
        dischargeRateW,
        percent: computedPercent,
        source: 'wmi',
      };
    }
    return {
      status: 'unavailable',
      mode: 'discharging',
      minutes: null,
      targetPercent: 0,
      chargeRateW: null,
      dischargeRateW,
      percent: computedPercent,
      source: 'none',
    };
  }

  if (computedPercent !== null && computedPercent >= 100) {
    return {
      status: 'full',
      mode: 'charging',
      minutes: 0,
      targetPercent: 100,
      chargeRateW,
      dischargeRateW: null,
      percent: 100,
      source: 'wmi',
    };
  }

  if (computedPercent !== null && targetPercent < 100 && computedPercent >= targetPercent) {
    return {
      status: 'limit-reached',
      mode: 'charging',
      minutes: 0,
      targetPercent,
      chargeRateW,
      dischargeRateW: null,
      percent: computedPercent,
      source: 'wmi',
    };
  }

  if (!anyCharging || validCapacityCount === 0 || totalFullMwh <= 0 || totalChargeRateMw <= 0) {
    return {
      status: 'unavailable',
      mode: anyCharging ? 'charging' : null,
      minutes: null,
      targetPercent,
      chargeRateW,
      dischargeRateW,
      percent: computedPercent,
      source: 'none',
    };
  }

  const targetMwh = totalFullMwh * (targetPercent / 100);
  const missingMwh = Math.max(0, targetMwh - totalRemainingMwh);
  if (missingMwh <= totalFullMwh * 0.005) {
    return {
      status: targetPercent < 100 ? 'limit-reached' : 'full',
      mode: 'charging',
      minutes: 0,
      targetPercent,
      chargeRateW,
      dischargeRateW: null,
      percent: computedPercent !== null ? computedPercent : targetPercent,
      source: 'wmi',
    };
  }

  // Exact physical time based on live hardware mWh and mW readings
  const minutes = Math.round((missingMwh / totalChargeRateMw) * 60);
  if (!Number.isFinite(minutes) || minutes < MIN_ETA_MINUTES || minutes > MAX_ETA_MINUTES) {
    return {
      status: 'unavailable',
      mode: 'charging',
      minutes: null,
      targetPercent,
      chargeRateW,
      dischargeRateW: null,
      percent: computedPercent,
      source: 'none',
    };
  }

  return {
    status: 'ok',
    mode: 'charging',
    minutes,
    targetPercent,
    chargeRateW,
    dischargeRateW: null,
    percent: computedPercent,
    source: 'wmi',
  };
}

let inFlightPromise = null;
let lastResult = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 1800;

function queryWindowsBatteryEta(options = {}) {
  if (process.platform !== 'win32') {
    return Promise.resolve({
      status: 'unavailable',
      minutes: null,
      targetPercent: 100,
      chargeRateW: null,
      percent: null,
      source: 'none',
    });
  }

  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && lastResult && now - lastFetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(lastResult);
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = new Promise((resolve) => {
    const ghelperLimit = readGHelperChargeLimit();
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', WMI_QUERY_SCRIPT],
      { windowsHide: true, timeout: 4500, maxBuffer: 256 * 1024 },
      (err, stdout) => {
        inFlightPromise = null;
        if (err || !stdout || !stdout.trim()) {
          resolve({
            status: 'unavailable',
            minutes: null,
            targetPercent: ghelperLimit || 100,
            chargeRateW: null,
            percent: null,
            source: 'none',
          });
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const batteries = parsed && typeof parsed === 'object' && 'batteries' in parsed ? parsed.batteries : parsed;
          const oemLimit = parsed && typeof parsed === 'object' ? parsed.oemChargeLimit : null;
          const targetPercent = ghelperLimit !== null ? ghelperLimit : oemLimit !== null ? oemLimit : 100;
          const result = computeBatteryChargeEta(batteries, { targetPercent });
          lastResult = result;
          lastFetchedAt = Date.now();
          resolve(result);
        } catch {
          resolve({
            status: 'unavailable',
            minutes: null,
            targetPercent: ghelperLimit || 100,
            chargeRateW: null,
            percent: null,
            source: 'none',
          });
        }
      }
    );
  });

  return inFlightPromise;
}

module.exports = {
  computeBatteryChargeEta,
  readGHelperChargeLimit,
  queryWindowsBatteryEta,
};
