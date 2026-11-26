'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const NOTIF_SETTINGS_REL_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings';
const BACKUP_SCHEMA_VERSION = 1;

// Never suppress Bedo's own notifications if any are emitted directly.
const EXCLUDED_APP_IDS = new Set([
  'com.bedo.assistant',
  'electron.app.bedo',
  'electron.app.electron',
  'bedo',
]);

function isExcludedAppId(appId) {
  if (typeof appId !== 'string') return true;
  const trimmed = appId.trim();
  if (!trimmed || trimmed.length > 512) return true;
  if (/[\0\r\n]/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (EXCLUDED_APP_IDS.has(lower)) return true;
  if (lower.startsWith('NOC_GLOBAL_SETTING_'.toLowerCase())) return true;
  return false;
}

function writeFileAtomicSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function readBackupFile(backupPath) {
  try {
    if (!backupPath || !fs.existsSync(backupPath)) {
      return { version: BACKUP_SCHEMA_VERSION, active: false, updatedAt: 0, entries: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { version: BACKUP_SCHEMA_VERSION, active: false, updatedAt: 0, entries: {} };
    }
    const entries =
      parsed.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries)
        ? parsed.entries
        : {};
    return {
      version: BACKUP_SCHEMA_VERSION,
      active: Boolean(parsed.active),
      updatedAt: Number(parsed.updatedAt) || 0,
      entries,
    };
  } catch {
    return { version: BACKUP_SCHEMA_VERSION, active: false, updatedAt: 0, entries: {} };
  }
}

/**
 * Reads toast-capable desktop & UWP app PrimaryIds from Windows WPN SQLite database
 * using a safe read-only temp copy (including WAL/SHM) so WpnUserService is never locked.
 */
function defaultReadWpnToastAppIds() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || '';
  if (!localAppData) return [];
  const srcDb = path.join(localAppData, 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
  if (!fs.existsSync(srcDb)) return [];

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    return [];
  }

  const tmpBase = path.join(
    os.tmpdir(),
    `bedo_wpn_apps_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );
  let db = null;
  try {
    fs.copyFileSync(srcDb, tmpBase);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(srcDb + suffix)) {
        fs.copyFileSync(srcDb + suffix, tmpBase + suffix);
      }
    }
    db = new DatabaseSync(tmpBase, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT DISTINCT h.PrimaryId
         FROM NotificationHandler h
         JOIN HandlerSettings hs ON hs.HandlerId = h.RecordId
         WHERE hs.SettingKey = 'c:toast'
           AND hs.Value = 1
           AND h.HandlerType IN ('app:desktop', 'app:immersive')`
      )
      .all();
    return rows
      .map((r) => (typeof r?.PrimaryId === 'string' ? r.PrimaryId.trim() : ''))
      .filter((id) => id && !isExcludedAppId(id));
  } catch {
    return [];
  } finally {
    try {
      if (db) db.close();
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(tmpBase + suffix)) fs.unlinkSync(tmpBase + suffix);
      } catch {}
    }
  }
}

/**
 * PowerShell script using .NET [Microsoft.Win32.Registry] directly.
 * Why .NET Registry instead of PowerShell's HKCU:\ provider?
 * - AppIds like "C:/ProgramData/ASUS/AsusSurvey/AsusSurvey.exe" or
 *   "Microsoft.MicrosoftEdge...!chrome-extension://.../" contain forward slashes '/',
 *   which Win32 RegCreateKeyExW keeps literal inside a single key name, whereas HKCU:\
 *   splits '/' into nested subkeys.
 * - AppIds like "{1AC14E77-...}\WindowsPowerShell\v1.0\powershell.exe" contain backslashes '\',
 *   which Win32 RegCreateKeyExW resolves to the exact nested subkey Windows uses.
 */
const PS_REGISTRY_WORKER = `
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rawInput = [Console]::In.ReadToEnd()
$req = $rawInput | ConvertFrom-Json
$basePath = '${NOTIF_SETTINGS_REL_KEY}'

function Get-LeafAppSubKeys($rootKey, [string]$prefix) {
  $results = New-Object System.Collections.Generic.List[string]
  if ($null -eq $rootKey) { return $results }
  foreach ($childName in $rootKey.GetSubKeyNames()) {
    $relPath = if ($prefix) { "$prefix\\$childName" } else { $childName }
    $sub = $null
    try {
      $sub = $rootKey.OpenSubKey($childName, $false)
      if ($null -eq $sub) { continue }
      $subCount = $sub.SubKeyCount
      $valCount = $sub.ValueCount
      if ($subCount -gt 0) {
        if ($valCount -gt 0) {
          $results.Add($relPath)
        }
        $nestedList = Get-LeafAppSubKeys $sub $relPath
        if ($null -ne $nestedList) {
          foreach ($nested in @($nestedList)) {
            if ($null -ne $nested -and [string]$nested -ne '') {
              $results.Add([string]$nested)
            }
          }
        }
      } else {
        $results.Add($relPath)
      }
    } catch {
    } finally {
      if ($null -ne $sub) { $sub.Close() }
    }
  }
  return $results
}

if ($req.action -eq 'suppress') {
  $root = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($basePath, $true)
  try {
    $excludeSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    if ($null -ne $req.excludeAppIds) {
      foreach ($ex in @($req.excludeAppIds)) {
        if ($null -ne $ex -and [string]$ex -ne '') {
          [void]$excludeSet.Add([string]$ex)
        }
      }
    }

    $targetSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    if ($req.discoverExisting -eq $true) {
      foreach ($existingId in @(Get-LeafAppSubKeys $root '')) {
        if ($null -ne $existingId -and [string]$existingId -ne '' -and -not $excludeSet.Contains([string]$existingId)) {
          [void]$targetSet.Add([string]$existingId)
        }
      }
    }
    if ($null -ne $req.appIds) {
      foreach ($id in @($req.appIds)) {
        if ($null -ne $id -and [string]$id -ne '' -and -not $excludeSet.Contains([string]$id)) {
          [void]$targetSet.Add([string]$id)
        }
      }
    }

    $snapshots = @{}
    $appliedCount = 0
    $errors = New-Object System.Collections.Generic.List[string]

    foreach ($appId in $targetSet) {
      $sub = $null
      try {
        $existingSub = $root.OpenSubKey($appId, $false)
        $keyExisted = ($null -ne $existingSub)
        $hadShowBanner = $false
        $prevVal = $null
        if ($keyExisted) {
          $rawVal = $existingSub.GetValue('ShowBanner', $null)
          if ($null -ne $rawVal) {
            $hadShowBanner = $true
            $prevVal = [int]$rawVal
          }
          $existingSub.Close()
          $existingSub = $null
        }

        $snapshots[$appId] = @{
          keyExisted = $keyExisted
          hadShowBanner = $hadShowBanner
          previousValue = $prevVal
        }

        $sub = $root.CreateSubKey($appId, $true)
        if ($null -ne $sub) {
          $sub.SetValue('ShowBanner', [int]0, [Microsoft.Win32.RegistryValueKind]::DWord)
          $appliedCount++
        }
      } catch {
        $errors.Add("$appId : $($_.Exception.Message)")
      } finally {
        if ($null -ne $sub) { $sub.Close() }
      }
    }

    @{
      ok = $true
      appliedCount = $appliedCount
      snapshots = $snapshots
      errors = $errors
    } | ConvertTo-Json -Depth 5 -Compress
  } finally {
    if ($null -ne $root) { $root.Close() }
  }
} elseif ($req.action -eq 'restore') {
  $root = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($basePath, $true)
  $restored = New-Object System.Collections.Generic.List[string]
  $failed = @{}
  try {
    if ($null -ne $root -and $null -ne $req.entries) {
      foreach ($prop in $req.entries.PSObject.Properties) {
        $appId = [string]$prop.Name
        $orig = $prop.Value
        $sub = $null
        try {
          $sub = $root.OpenSubKey($appId, $true)
          if ($null -eq $sub) {
            $restored.Add($appId)
            continue
          }
          if ($orig.hadShowBanner -eq $true -and $null -ne $orig.previousValue) {
            $sub.SetValue('ShowBanner', [int]$orig.previousValue, [Microsoft.Win32.RegistryValueKind]::DWord)
            $sub.Close()
            $sub = $null
          } else {
            $sub.DeleteValue('ShowBanner', $false)
            $remainingVals = $sub.ValueCount
            $remainingSubs = $sub.SubKeyCount
            $sub.Close()
            $sub = $null
            if ($orig.keyExisted -eq $false -and $remainingVals -eq 0 -and $remainingSubs -eq 0) {
              try { $root.DeleteSubKey($appId, $false) } catch {}
            }
          }
          $restored.Add($appId)
        } catch {
          $failed[$appId] = $_.Exception.Message
        } finally {
          if ($null -ne $sub) { $sub.Close() }
        }
      }
    }
    @{
      ok = ($failed.Count -eq 0)
      restored = $restored
      failed = $failed
    } | ConvertTo-Json -Depth 5 -Compress
  } finally {
    if ($null -ne $root) { $root.Close() }
  }
} else {
  throw "Unsupported action: $($req.action)"
}
`;

function defaultRegistryAdapter(payload) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve({ ok: true, appliedCount: 0, snapshots: {}, restored: [], failed: {}, errors: [] });
      return;
    }
    const encoded = Buffer.from(PS_REGISTRY_WORKER, 'utf16le').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error('Windows Registry operation timed out'));
    }, 20000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (code !== 0 && !trimmed) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      try {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        const parsed = JSON.parse(lines[lines.length - 1] || '{}');
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Registry worker output: ${stderr.trim() || err.message}`));
      }
    });

    try {
      child.stdin.write(JSON.stringify(payload), 'utf8');
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function createWindowsBannerSuppressor(options = {}) {
  const backupFilePath = options.backupFilePath;
  if (!backupFilePath) {
    throw new Error('backupFilePath is required for createWindowsBannerSuppressor');
  }
  const registryAdapter = options.registryAdapter || defaultRegistryAdapter;
  const readWpnToastAppIds = options.readWpnToastAppIds || defaultReadWpnToastAppIds;

  const suppressedCache = new Set();
  let opQueue = Promise.resolve();
  let initialized = false;

  function enqueue(fn) {
    const next = opQueue.then(fn, fn);
    opQueue = next.catch(() => {});
    return next;
  }

  function hydrateCacheFromDisk() {
    if (initialized) return;
    initialized = true;
    const backup = readBackupFile(backupFilePath);
    suppressedCache.clear();
    if (backup.active) {
      for (const appId of Object.keys(backup.entries)) {
        suppressedCache.add(appId);
      }
    }
  }

  function saveBackup(state) {
    writeFileAtomicSync(
      backupFilePath,
      JSON.stringify(
        {
          version: BACKUP_SCHEMA_VERSION,
          active: Boolean(state.active),
          updatedAt: Date.now(),
          entries: state.entries || {},
        },
        null,
        2
      )
    );
  }

  async function enableInternal() {
    hydrateCacheFromDisk();
    const backup = readBackupFile(backupFilePath);
    const wpnIds = readWpnToastAppIds().filter((id) => !isExcludedAppId(id));

    const res = await registryAdapter({
      action: 'suppress',
      discoverExisting: true,
      appIds: wpnIds,
      excludeAppIds: Array.from(EXCLUDED_APP_IDS),
    });

    const nextEntries = { ...backup.entries };
    const snapshots = res?.snapshots && typeof res.snapshots === 'object' ? res.snapshots : {};
    for (const [appId, snap] of Object.entries(snapshots)) {
      if (isExcludedAppId(appId)) continue;
      // Preserve the original pre-suppression state if already backed up!
      if (!Object.prototype.hasOwnProperty.call(nextEntries, appId)) {
        nextEntries[appId] = {
          keyExisted: Boolean(snap?.keyExisted),
          hadShowBanner: Boolean(snap?.hadShowBanner),
          previousValue:
            snap?.hadShowBanner && snap?.previousValue !== null && snap?.previousValue !== undefined
              ? Number(snap.previousValue)
              : null,
        };
      }
      suppressedCache.add(appId);
    }

    saveBackup({ active: true, entries: nextEntries });
    return {
      ok: true,
      active: true,
      suppressedCount: Object.keys(nextEntries).length,
      appliedCount: Number(res?.appliedCount) || Object.keys(snapshots).length,
      errors: Array.isArray(res?.errors) ? res.errors : [],
    };
  }

  async function disableInternal() {
    hydrateCacheFromDisk();
    const backup = readBackupFile(backupFilePath);
    const entryKeys = Object.keys(backup.entries);
    if (entryKeys.length === 0) {
      suppressedCache.clear();
      if (backup.active) {
        saveBackup({ active: false, entries: {} });
      }
      return { ok: true, active: false, suppressedCount: 0, restoredCount: 0, errors: [] };
    }

    const res = await registryAdapter({
      action: 'restore',
      entries: backup.entries,
    });

    const restoredList = Array.isArray(res?.restored)
      ? res.restored
      : typeof res?.restored === 'string' && res.restored
        ? [res.restored]
        : [];
    const remainingEntries = { ...backup.entries };
    for (const appId of restoredList) {
      delete remainingEntries[appId];
      suppressedCache.delete(appId);
    }

    const hasRemaining = Object.keys(remainingEntries).length > 0;
    saveBackup({
      active: hasRemaining,
      entries: remainingEntries,
    });

    const failedObj = res?.failed && typeof res.failed === 'object' ? res.failed : {};
    const errors = Object.entries(failedObj).map(([k, v]) => `${k}: ${v}`);

    return {
      ok: !hasRemaining,
      active: hasRemaining,
      suppressedCount: Object.keys(remainingEntries).length,
      restoredCount: restoredList.length,
      errors,
    };
  }

  async function ensureAppSuppressedInternal(appId) {
    hydrateCacheFromDisk();
    const trimmed = typeof appId === 'string' ? appId.trim() : '';
    if (isExcludedAppId(trimmed)) {
      return { ok: true, skipped: true };
    }
    const backup = readBackupFile(backupFilePath);
    if (!backup.active) {
      return { ok: true, skipped: true };
    }
    if (suppressedCache.has(trimmed) && Object.prototype.hasOwnProperty.call(backup.entries, trimmed)) {
      return { ok: true, alreadySuppressed: true };
    }

    const res = await registryAdapter({
      action: 'suppress',
      discoverExisting: false,
      appIds: [trimmed],
    });

    const nextEntries = { ...backup.entries };
    const snap = res?.snapshots?.[trimmed];
    if (snap && !Object.prototype.hasOwnProperty.call(nextEntries, trimmed)) {
      nextEntries[trimmed] = {
        keyExisted: Boolean(snap.keyExisted),
        hadShowBanner: Boolean(snap.hadShowBanner),
        previousValue:
          snap.hadShowBanner && snap.previousValue !== null && snap.previousValue !== undefined
            ? Number(snap.previousValue)
            : null,
      };
    }
    suppressedCache.add(trimmed);
    saveBackup({ active: true, entries: nextEntries });

    return {
      ok: true,
      active: true,
      suppressedCount: Object.keys(nextEntries).length,
    };
  }

  function getStatusSync() {
    hydrateCacheFromDisk();
    const backup = readBackupFile(backupFilePath);
    return {
      supported: process.platform === 'win32',
      active: Boolean(backup.active),
      suppressedCount: Object.keys(backup.entries).length,
      updatedAt: backup.updatedAt || 0,
    };
  }

  return {
    enable: () => enqueue(enableInternal),
    disable: () => enqueue(disableInternal),
    syncWithSettings: (settings = {}) => {
      const shouldSuppress =
        Boolean(settings.suppressWindowsBanners) && settings.windowsNotifications !== false;
      return enqueue(async () => {
        hydrateCacheFromDisk();
        const backup = readBackupFile(backupFilePath);
        if (shouldSuppress) {
          return enableInternal();
        }
        if (backup.active || Object.keys(backup.entries).length > 0) {
          return disableInternal();
        }
        return { ok: true, active: false, suppressedCount: 0 };
      });
    },
    ensureAppSuppressed: (appId) => {
      const trimmed = typeof appId === 'string' ? appId.trim() : '';
      if (!trimmed || isExcludedAppId(trimmed)) {
        return Promise.resolve({ ok: true, skipped: true });
      }
      hydrateCacheFromDisk();
      if (suppressedCache.has(trimmed)) {
        return Promise.resolve({ ok: true, alreadySuppressed: true });
      }
      return enqueue(() => ensureAppSuppressedInternal(trimmed));
    },
    getStatus: () => Promise.resolve(getStatusSync()),
    getStatusSync,
  };
}

module.exports = {
  createWindowsBannerSuppressor,
  isExcludedAppId,
  NOTIF_SETTINGS_REL_KEY,
};
