const { execFile } = require('child_process');

const MAX_VALID_U32 = 0x7fffffff; // Filter ACPI unknown sentinels (0x80000000, 0xFFFFFFFF)
const MIN_VALID_CHARGE_RATE_MW = 500; // 0.5 W minimum to ignore noise / trickle-off
const MAX_VALID_CHARGE_RATE_MW = 500000; // 500 W upper sanity bound
const MIN_ETA_MINUTES = 1;
const MAX_ETA_MINUTES = 720; // 12 hours upper sanity bound
const CC_CV_KNEE = 0.8; // Li-ion constant-current to constant-voltage transition (~80%)
const CV_TAPER_MULTIPLIER = 1.85; // Average slow-down factor for 80%->100% relative to CC rate
const CV_RESIDUAL_MAX_FACTOR = 0.35; // Mild residual taper when already inside 80%->100%

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
  '  $items += [PSCustomObject]@{',
  '    instanceName = [string]$s.InstanceName',
  '    charging = [bool]$s.Charging',
  '    chargeRateMw = [double]$s.ChargeRate',
  '    remainingCapacityMwh = [double]$s.RemainingCapacity',
  '    fullChargedCapacityMwh = $full',
  '    percent = $pct',
  '  }',
  '}',
  'if ($items.Count -eq 0 -and $wb.Count -gt 0) {',
  '  foreach ($b in $wb) {',
  '    $items += [PSCustomObject]@{',
  '      instanceName = [string]$b.DeviceID',
  '      charging = ($b.BatteryStatus -eq 2 -or $b.BatteryStatus -eq 6 -or $b.BatteryStatus -eq 7 -or $b.BatteryStatus -eq 8 -or $b.BatteryStatus -eq 9)',
  '      chargeRateMw = 0',
  '      remainingCapacityMwh = 0',
  '      fullChargedCapacityMwh = 0',
  '      percent = [double]$b.EstimatedChargeRemaining',
  '    }',
  '  }',
  '}',
  '@($items) | ConvertTo-Json -Compress -Depth 3',
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

/**
 * Pure, deterministic ETA calculator for single or multi-battery Windows systems.
 * Applies a smooth Li-ion CC-CV taper model above 80% SoC so estimates stay realistic.
 *
 * @param {Array<object>} batteries
 * @returns {{ status: 'ok'|'full'|'unavailable', minutes: number|null, linearMinutes: number|null, chargeRateW: number|null, percent: number|null, source: 'wmi'|'none' }}
 */
function computeBatteryChargeEta(batteries) {
  const list = Array.isArray(batteries) ? batteries : batteries ? [batteries] : [];
  if (list.length === 0) {
    return { status: 'unavailable', minutes: null, linearMinutes: null, chargeRateW: null, percent: null, source: 'none' };
  }

  let totalFullMwh = 0;
  let totalRemainingMwh = 0;
  let totalChargeRateMw = 0;
  let anyCharging = false;
  let validCapacityCount = 0;
  let fallbackPercentSum = 0;
  let fallbackPercentCount = 0;

  for (const bat of list) {
    if (!bat || typeof bat !== 'object') continue;
    const isCharging = Boolean(bat.charging);
    if (isCharging) anyCharging = true;

    const full = Number(bat.fullChargedCapacityMwh);
    const rem = Number(bat.remainingCapacityMwh);
    const rate = Number(bat.chargeRateMw);
    const pct = Number(bat.percent);

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
  }

  const computedPercent =
    validCapacityCount > 0 && totalFullMwh > 0
      ? Math.min(100, Math.max(0, Math.round((totalRemainingMwh / totalFullMwh) * 100)))
      : fallbackPercentCount > 0
        ? Math.min(100, Math.max(0, Math.round(fallbackPercentSum / fallbackPercentCount)))
        : null;

  if (computedPercent !== null && computedPercent >= 100) {
    return {
      status: 'full',
      minutes: 0,
      linearMinutes: 0,
      chargeRateW: totalChargeRateMw > 0 ? Math.round((totalChargeRateMw / 1000) * 10) / 10 : null,
      percent: 100,
      source: 'wmi',
    };
  }

  if (!anyCharging || validCapacityCount === 0 || totalFullMwh <= 0 || totalChargeRateMw <= 0) {
    return {
      status: 'unavailable',
      minutes: null,
      linearMinutes: null,
      chargeRateW: totalChargeRateMw > 0 ? Math.round((totalChargeRateMw / 1000) * 10) / 10 : null,
      percent: computedPercent,
      source: 'none',
    };
  }

  const missingMwh = Math.max(0, totalFullMwh - totalRemainingMwh);
  if (missingMwh <= totalFullMwh * 0.005) {
    return {
      status: 'full',
      minutes: 0,
      linearMinutes: 0,
      chargeRateW: Math.round((totalChargeRateMw / 1000) * 10) / 10,
      percent: 100,
      source: 'wmi',
    };
  }

  const linearHours = missingMwh / totalChargeRateMw;
  const linearMinutes = Math.round(linearHours * 60);

  const soc = totalRemainingMwh / totalFullMwh;
  let adjustedHours;
  if (soc < CC_CV_KNEE) {
    const ccMwh = totalFullMwh * CC_CV_KNEE - totalRemainingMwh;
    const cvMwh = totalFullMwh * (1 - CC_CV_KNEE);
    adjustedHours = ccMwh / totalChargeRateMw + (cvMwh / totalChargeRateMw) * CV_TAPER_MULTIPLIER;
  } else {
    const remainingFractionOfCv = Math.max(0, Math.min(1, (1 - soc) / (1 - CC_CV_KNEE)));
    const residualMultiplier = 1 + CV_RESIDUAL_MAX_FACTOR * remainingFractionOfCv;
    adjustedHours = (missingMwh / totalChargeRateMw) * residualMultiplier;
  }

  const minutes = Math.round(adjustedHours * 60);
  if (!Number.isFinite(minutes) || minutes < MIN_ETA_MINUTES || minutes > MAX_ETA_MINUTES) {
    return {
      status: 'unavailable',
      minutes: null,
      linearMinutes: null,
      chargeRateW: Math.round((totalChargeRateMw / 1000) * 10) / 10,
      percent: computedPercent,
      source: 'none',
    };
  }

  return {
    status: 'ok',
    minutes,
    linearMinutes: Math.max(1, linearMinutes),
    chargeRateW: Math.round((totalChargeRateMw / 1000) * 10) / 10,
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
      linearMinutes: null,
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
            linearMinutes: null,
            chargeRateW: null,
            percent: null,
            source: 'none',
          });
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const result = computeBatteryChargeEta(parsed);
          lastResult = result;
          lastFetchedAt = Date.now();
          resolve(result);
        } catch {
          resolve({
            status: 'unavailable',
            minutes: null,
            linearMinutes: null,
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
  queryWindowsBatteryEta,
};
