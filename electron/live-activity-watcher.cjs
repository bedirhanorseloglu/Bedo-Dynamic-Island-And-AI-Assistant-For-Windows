const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CHROMIUM_HISTORY_PATHS = () => {
  const local = process.env.LOCALAPPDATA || '';
  const roaming = process.env.APPDATA || '';
  const results = [
    path.join(roaming, 'Opera Software', 'Opera Stable', 'History'),
    path.join(roaming, 'Opera Software', 'Opera GX Stable', 'History'),
  ];
  const userDataRoots = [
    path.join(local, 'Google', 'Chrome', 'User Data'),
    path.join(local, 'Microsoft', 'Edge', 'User Data'),
    path.join(local, 'Perplexity', 'Comet', 'User Data'),
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    path.join(local, 'Vivaldi', 'User Data'),
    path.join(local, 'Chromium', 'User Data'),
  ];
  for (const root of userDataRoots) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root)) {
        if (entry === 'Default' || /^Profile\s+\d+$/i.test(entry)) {
          results.push(path.join(root, entry, 'History'));
        }
      }
    } catch {}
  }
  return results;
};

function getLatestMtime(basePath) {
  let latest = 0;
  for (const ext of ['', '-journal', '-wal']) {
    try {
      const p = basePath + ext;
      if (fs.existsSync(p)) {
        const m = fs.statSync(p).mtimeMs;
        if (m > latest) latest = m;
      }
    } catch {}
  }
  return latest;
}

const SIZE_UNIT_MULTIPLIERS = {
  b: 1,
  bayt: 1,
  bytes: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
};

function parseSizeToBytes(numStr, unitStr) {
  if (!numStr || !unitStr) return null;
  const num = parseFloat(String(numStr).replace(',', '.'));
  const mult = SIZE_UNIT_MULTIPLIERS[String(unitStr).trim().toLowerCase()];
  if (!Number.isFinite(num) || num <= 0 || !mult) return null;
  return Math.round(num * mult);
}

function extractDownloadMetaFromUiaText(text, fileSize = 0) {
  if (!text) return null;
  const raw = String(text);

  // Match browser download progress strings like "0,3/1,4 GB", "323.2 / 1400 MB", "120 MB / 1.4 GB"
  const pairRegex =
    /(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB|TİB|GİB|MİB|KİB|Bayt|B)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB|TİB|GİB|MİB|KİB|Bayt|B)\b/gi;
  for (const m of raw.matchAll(pairRegex)) {
    const totalBytes = parseSizeToBytes(m[3], m[4]);
    const downloadedBytes = parseSizeToBytes(m[1], m[2] || m[4]);
    if (!totalBytes || totalBytes <= 0) continue;
    if (fileSize > 0) {
      if (fileSize > totalBytes * 1.15) continue;
      if (downloadedBytes && Math.abs(downloadedBytes - fileSize) > Math.max(180 * 1024 * 1024, fileSize * 0.65)) {
        continue;
      }
    }
    return { totalBytes };
  }

  // Fallback: explicit percentage in download-related text (e.g. "%23" or "23%") or bare percentage ("%23")
  const hasDownloadHint =
    /(indir|download|tamamlan|complete|progress|devam|kaldı|remaining|left|gb|mb|kb|saat|dakika|saniye|sn|dk|sa|sec|min|hr|•)/i.test(raw) ||
    /^\s*(?:%\s*\d{1,2}(?:[.,]\d+)?|\d{1,2}(?:[.,]\d+)?\s*%)\s*$/.test(raw);
  if (hasDownloadHint && fileSize > 0) {
    const pctMatch = raw.match(/(?:%\s*(\d{1,2}(?:[.,]\d+)?)|(\d{1,2}(?:[.,]\d+)?)\s*%)/);
    if (pctMatch) {
      const pct = parseFloat((pctMatch[1] || pctMatch[2]).replace(',', '.'));
      if (Number.isFinite(pct) && pct >= 1 && pct < 100) {
        return { totalBytes: Math.round(fileSize / (pct / 100)) };
      }
    }
  }

  return null;
}

function lookupBrowserUiaDownloadMeta(fileSize, callback) {
  const psScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$procs = Get-Process | Where-Object { $_.ProcessName -match '^(chrome|comet|msedge|brave|opera|vivaldi|firefox)$' } | Select-Object -ExpandProperty Id
if (-not $procs) { exit 0 }
$pidSet = @{}
foreach ($p in $procs) { $pidSet[$p] = $true }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$docType = [System.Windows.Automation.ControlType]::Document
$progType = [System.Windows.Automation.ControlType]::ProgressBar

function Scan-Node($el, $depth, $allowDoc) {
  if ($null -eq $el -or $depth -gt 12) { return }
  try {
    $ct = $el.Current.ControlType
    $n = $el.Current.Name
    if ($ct -eq $docType -and -not $allowDoc) {
      if (-not ($n -and $n -match '(?i)indirilenler|downloads')) { return }
    }
    foreach ($txt in @($n, $el.Current.HelpText, $el.Current.ItemStatus)) {
      if ($txt -and ($txt -match '\\d+[.,]?\\d*\\s*(TB|GB|MB|KB|Bayt|B)?\\s*/\\s*\\d+[.,]?\\d*\\s*(TB|GB|MB|KB|Bayt|B)' -or $txt -match '^\\s*(?:%\\s*\\d{1,2}(?:[.,]\\d+)?|\\d{1,2}(?:[.,]\\d+)?\\s*%)\\s*$' -or ($txt -match '%' -and $txt -match '(?i)indir|download|tamamlan|complete|progress|devam|kaldı|remaining|left|gb|mb|kb|sn|dk|sa|sec|min|hr|•'))) {
        Write-Output ("TEXT:" + $txt)
      }
    }
    if ($ct -eq $progType) {
      try {
        $rv = $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
        if ($rv -and $rv.Current.Maximum -gt 0 -and $rv.Current.Value -gt 0) {
          $pct = ($rv.Current.Value / $rv.Current.Maximum) * 100.0
          Write-Output ("PCT:" + [math]::Round($pct, 2))
        }
      } catch {}
    }
    $child = $walker.GetFirstChild($el)
    while ($null -ne $child) {
      Scan-Node $child ($depth + 1) $allowDoc
      $child = $walker.GetNextSibling($child)
    }
  } catch {}
}

$win = $walker.GetFirstChild($root)
while ($null -ne $win) {
  try {
    if ($pidSet.ContainsKey($win.Current.ProcessId)) {
      $wName = $win.Current.Name
      $rect = $win.Current.BoundingRectangle
      $isPopup = ($rect.Width -gt 0 -and $rect.Width -lt 800)
      $allowDoc = ($isPopup -or ($wName -and $wName -match '(?i)indirilenler|downloads'))
      Scan-Node $win 0 $allowDoc
    }
  } catch {}
  $win = $walker.GetNextSibling($win)
}
`;

  const encodedPs = Buffer.from(psScript, 'utf16le').toString('base64');
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedPs],
    { timeout: 3500, windowsHide: true },
    (err, stdout) => {
      if (!stdout) return callback(null);
      const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('TEXT:')) {
          const meta = extractDownloadMetaFromUiaText(line.slice(5), fileSize);
          if (meta && meta.totalBytes) return callback(meta);
        } else if (line.startsWith('PCT:') && fileSize > 0) {
          const pct = parseFloat(line.slice(4));
          if (Number.isFinite(pct) && pct >= 1 && pct < 100) {
            return callback({ totalBytes: Math.round(fileSize / (pct / 100)) });
          }
        }
      }
      callback(null);
    }
  );
}

function lookupChromiumDownloadMeta(partialName, cleanName, fileSize, callback) {
  const tryUiaFallback = () => {
    lookupBrowserUiaDownloadMeta(fileSize, (uiaMeta) => {
      callback(uiaMeta || null);
    });
  };

  try {
    const candidates = CHROMIUM_HISTORY_PATHS()
      .filter((p) => fs.existsSync(p))
      .map((p) => ({ path: p, mtime: getLatestMtime(p) }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 4)
      .map((x) => x.path);

    if (candidates.length === 0) return tryUiaFallback();

    const pyCode = [
      'import sys, os, shutil, sqlite3, tempfile, json, urllib.request',
      'partial, clean, fsize = sys.argv[1].lower(), sys.argv[2].lower(), int(sys.argv[3])',
      'def query_conn(conn):',
      '    return conn.execute("SELECT current_path, target_path, total_bytes, received_bytes, state FROM downloads WHERE total_bytes > 0 ORDER BY start_time DESC LIMIT 15").fetchall()',
      'for src in sys.argv[4:]:',
      '    rows = None',
      '    tmp = os.path.join(tempfile.gettempdir(), f"tc_hist_{os.getpid()}.db")',
      '    try:',
      '        shutil.copy2(src, tmp)',
      '        for ext in ("-wal", "-shm", "-journal"):',
      '            if os.path.exists(src + ext):',
      '                try: shutil.copy2(src + ext, tmp + ext)',
      '                except Exception: pass',
      '        conn = sqlite3.connect(tmp)',
      '        rows = query_conn(conn)',
      '        conn.close()',
      '    except Exception:',
      '        rows = None',
      '    finally:',
      '        for ext in ("", "-wal", "-shm", "-journal"):',
      '            try: os.remove(tmp + ext)',
      '            except Exception: pass',
      '    if not rows:',
      '        try:',
      '            uri = "file:" + urllib.request.pathname2url(os.path.abspath(src)) + "?immutable=1"',
      '            conn = sqlite3.connect(uri, uri=True)',
      '            rows = query_conn(conn)',
      '            conn.close()',
      '        except Exception:',
      '            rows = None',
      '    if not rows:',
      '        continue',
      '    for cur, tgt, tb, rb, st in rows:',
      '        c = (cur or "").lower()',
      '        t = (tgt or "").lower()',
      '        if partial in c or clean in t or clean in c:',
      '            print(json.dumps({"totalBytes": int(tb), "title": os.path.basename(tgt) if tgt else None}))',
      '            sys.exit(0)',
      '    for cur, tgt, tb, rb, st in rows:',
      '        if st == 0 and tb > 0 and (fsize <= 0 or fsize <= tb * 1.05):',
      '            print(json.dumps({"totalBytes": int(tb), "title": os.path.basename(tgt) if tgt else None}))',
      '            sys.exit(0)',
    ].join('\n');

    execFile(
      'python',
      ['-c', pyCode, partialName, cleanName, String(Math.max(0, Math.round(fileSize || 0))), ...candidates],
      { timeout: 4500, windowsHide: true },
      (err, stdout) => {
        if (!err && stdout) {
          try {
            const parsed = JSON.parse(String(stdout).trim());
            if (parsed && Number.isFinite(parsed.totalBytes) && parsed.totalBytes > 0) {
              return callback({
                totalBytes: parsed.totalBytes,
                title: parsed.title || null,
              });
            }
          } catch {}
        }
        tryUiaFallback();
      }
    );
  } catch {
    tryUiaFallback();
  }
}

function getSteamLibraryPaths() {
  const candidates = new Set([
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'),
  ]);
  const steamAppsDirs = new Set();
  for (const base of candidates) {
    const sa = path.join(base, 'steamapps');
    if (fs.existsSync(sa)) {
      steamAppsDirs.add(sa);
      const vdfPath = path.join(sa, 'libraryfolders.vdf');
      try {
        if (fs.existsSync(vdfPath)) {
          const raw = fs.readFileSync(vdfPath, 'utf8');
          const matches = raw.matchAll(/"path"\s+"([^"]+)"/g);
          for (const m of matches) {
            const libPath = m[1].replace(/\\\\/g, '\\');
            const libSteamApps = path.join(libPath, 'steamapps');
            if (fs.existsSync(libSteamApps)) steamAppsDirs.add(libSteamApps);
          }
        }
      } catch {}
    }
  }
  return Array.from(steamAppsDirs);
}

function parseSteamAcf(content) {
  const getVal = (key) => {
    const m = content.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'));
    return m ? m[1] : '';
  };
  return {
    appid: getVal('appid'),
    name: getVal('name'),
    stateFlags: parseInt(getVal('StateFlags') || '0', 10),
    bytesDownloaded: Number(getVal('BytesDownloaded') || 0),
    bytesToDownload: Number(getVal('BytesToDownload') || 0),
  };
}

/**
 * Watches browser downloads and Steam .acf manifests with zero idle polling.
 */
function createLiveActivityWatcher({ downloadsDir, onUpdate }) {
  const watchers = [];
  let downloadTrackTimer = null;
  let lastDownloadSample = null;
  let lastSteamSample = null;
  let steamClearTimer = null;

  const scanSteamDownloads = (steamAppsDirs) => {
    let activeDownload = null;
    for (const dir of steamAppsDirs) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue;
          const info = parseSteamAcf(fs.readFileSync(path.join(dir, file), 'utf8'));
          if (info.bytesToDownload > 0 && info.stateFlags !== 4 && info.bytesDownloaded < info.bytesToDownload) {
            activeDownload = info;
            break;
          }
        }
        if (activeDownload) break;
      } catch {}
    }

    if (activeDownload) {
      clearTimeout(steamClearTimer);
      const now = Date.now();
      let speedMBps = 0;
      if (lastSteamSample && lastSteamSample.appid === activeDownload.appid) {
        const dt = Math.max(0.2, (now - lastSteamSample.time) / 1000);
        speedMBps = Math.max(0, activeDownload.bytesDownloaded - lastSteamSample.bytes) / (1024 * 1024) / dt;
      }
      lastSteamSample = {
        appid: activeDownload.appid,
        name: activeDownload.name,
        bytes: activeDownload.bytesDownloaded,
        time: now,
      };
      const percent = Math.min(99.9, Math.max(1, (activeDownload.bytesDownloaded / activeDownload.bytesToDownload) * 100));
      onUpdate({
        active: true,
        kind: 'steam',
        id: `steam-${activeDownload.appid}`,
        title: activeDownload.name || `Steam #${activeDownload.appid}`,
        percent: Math.round(percent * 10) / 10,
        speedMBps: Math.round(speedMBps * 10) / 10,
        downloadedGB: Math.round((activeDownload.bytesDownloaded / 1024 ** 3) * 100) / 100,
        totalGB: Math.round((activeDownload.bytesToDownload / 1024 ** 3) * 100) / 100,
        done: false,
      });
    } else if (lastSteamSample) {
      const finishedName = lastSteamSample.name || 'Steam İndirmesi';
      lastSteamSample = null;
      onUpdate({
        active: true,
        kind: 'steam',
        id: 'steam-done',
        title: finishedName,
        percent: 100,
        speedMBps: 0,
        done: true,
      });
      clearTimeout(steamClearTimer);
      steamClearTimer = setTimeout(() => onUpdate({ active: false, kind: 'steam' }), 3500);
    }
  };

  const start = () => {
    try {
      if (downloadsDir && fs.existsSync(downloadsDir)) {
        let cachedDownloadMeta = { file: null, totalBytes: null, title: null, lastLookupTime: 0, lookingUp: false };
        const checkDownloads = () => {
          try {
            const files = fs.readdirSync(downloadsDir);
            const partials = files
              .filter((f) => /\.(crdownload|part|tmp)$/i.test(f))
              .map((f) => {
                try {
                  return { name: f, stat: fs.statSync(path.join(downloadsDir, f)) };
                } catch {
                  return null;
                }
              })
              .filter(Boolean)
              .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
            const activePartial = partials[0];
            if (activePartial) {
              const partial = activePartial.name;
              const stat = activePartial.stat;
              const now = Date.now();
              let speedMBps = 0;
              if (lastDownloadSample && lastDownloadSample.file === partial) {
                const dt = Math.max(0.2, (now - lastDownloadSample.time) / 1000);
                speedMBps = Math.max(0, stat.size - lastDownloadSample.size) / (1024 * 1024) / dt;
              }
              lastDownloadSample = { file: partial, size: stat.size, time: now };
              const cleanName = partial.replace(/\.(crdownload|part|tmp)$/i, '');

              const emitDownloadProgress = (fileSize, totalBytes, resolvedTitle) => {
                const computedPercent =
                  totalBytes && totalBytes > 0
                    ? Math.min(99.9, Math.max(1, Math.round((fileSize / totalBytes) * 1000) / 10))
                    : null;

                onUpdate({
                  active: true,
                  kind: 'download',
                  id: `dl-${cleanName}`,
                  title: resolvedTitle || cleanName,
                  downloadedMB: Math.round((fileSize / (1024 * 1024)) * 10) / 10,
                  totalMB: totalBytes ? Math.round((totalBytes / (1024 * 1024)) * 10) / 10 : null,
                  speedMBps: Math.round(speedMBps * 10) / 10,
                  percent: computedPercent,
                  done: false,
                });
              };

              if (cachedDownloadMeta.file !== partial) {
                cachedDownloadMeta = { file: partial, totalBytes: null, title: null, lastLookupTime: 0, lookingUp: false };
              }
              if (!cachedDownloadMeta.totalBytes && !cachedDownloadMeta.lookingUp) {
                if (now - cachedDownloadMeta.lastLookupTime >= 1000) {
                  cachedDownloadMeta.lookingUp = true;
                  cachedDownloadMeta.lastLookupTime = now;
                  const targetFile = partial;
                  const latestSize = stat.size;
                  lookupChromiumDownloadMeta(partial, cleanName, latestSize, (meta) => {
                    if (cachedDownloadMeta.file === targetFile) {
                      cachedDownloadMeta.lookingUp = false;
                      if (meta && meta.totalBytes) {
                        cachedDownloadMeta.totalBytes = meta.totalBytes;
                        if (meta.title) cachedDownloadMeta.title = meta.title;
                        emitDownloadProgress(latestSize, meta.totalBytes, cachedDownloadMeta.title);
                      }
                    }
                  });
                }
              }

              emitDownloadProgress(stat.size, cachedDownloadMeta.totalBytes, cachedDownloadMeta.title);
              if (!downloadTrackTimer) {
                downloadTrackTimer = setInterval(checkDownloads, 750);
              }
            } else {
              if (downloadTrackTimer) {
                clearInterval(downloadTrackTimer);
                downloadTrackTimer = null;
              }
              if (lastDownloadSample) {
                const cleanName =
                  (cachedDownloadMeta.file === lastDownloadSample.file && cachedDownloadMeta.title) ||
                  lastDownloadSample.file.replace(/\.(crdownload|part|tmp)$/i, '');
                lastDownloadSample = null;
                onUpdate({
                  active: true,
                  kind: 'download',
                  id: 'dl-done',
                  title: cleanName,
                  percent: 100,
                  speedMBps: 0,
                  done: true,
                });
                setTimeout(() => onUpdate({ active: false, kind: 'download' }), 3500);
              }
            }
          } catch {
            if (downloadTrackTimer) {
              clearInterval(downloadTrackTimer);
              downloadTrackTimer = null;
            }
          }
        };

        let dlWatchDebounce = null;
        watchers.push(
          fs.watch(downloadsDir, () => {
            clearTimeout(dlWatchDebounce);
            dlWatchDebounce = setTimeout(checkDownloads, 120);
          })
        );
        checkDownloads();
      }
    } catch {}

    try {
      const steamDirs = getSteamLibraryPaths();
      if (steamDirs.length > 0) {
        let steamDebounce = null;
        const triggerSteamScan = () => {
          clearTimeout(steamDebounce);
          steamDebounce = setTimeout(() => scanSteamDownloads(steamDirs), 350);
        };
        for (const dir of steamDirs) {
          watchers.push(
            fs.watch(dir, (_ev, filename) => {
              if (!filename || filename.endsWith('.acf')) triggerSteamScan();
            })
          );
        }
        scanSteamDownloads(steamDirs);
      }
    } catch {}
  };

  const stop = () => {
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
    watchers.length = 0;
    if (downloadTrackTimer) {
      clearInterval(downloadTrackTimer);
      downloadTrackTimer = null;
    }
    clearTimeout(steamClearTimer);
  };

  return { start, stop };
}

module.exports = {
  createLiveActivityWatcher,
  parseSizeToBytes,
  extractDownloadMetaFromUiaText,
  lookupChromiumDownloadMeta,
  lookupBrowserUiaDownloadMeta,
};

