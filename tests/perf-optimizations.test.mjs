import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');

const {
  extractExecutableFromCommand,
  parseRegQueryRunOutput,
  computeStaleRunValueNames,
  syncWindowsStartup,
} = require('../electron/startup-policy.cjs');

test('extractExecutableFromCommand handles quoted and unquoted paths with spaces', () => {
  assert.equal(
    extractExecutableFromCommand('"C:\\Users\\Bedirhan Orseloglu\\AppData\\Local\\Programs\\TwoCode\\TwoCode.exe" --flag'),
    'C:\\Users\\Bedirhan Orseloglu\\AppData\\Local\\Programs\\TwoCode\\TwoCode.exe'
  );
  assert.equal(
    extractExecutableFromCommand(
      'C:\\Users\\Bedirhan Orseloglu\\OneDrive\\Masaüstü\\deneme\\node_modules\\electron\\dist\\electron.exe "C:\\Users\\Bedirhan Orseloglu\\OneDrive\\Masaüstü\\deneme"'
    ),
    'C:\\Users\\Bedirhan Orseloglu\\OneDrive\\Masaüstü\\deneme\\node_modules\\electron\\dist\\electron.exe'
  );
});

test('computeStaleRunValueNames removes dev electron.exe and dead legacy entries while preserving valid unrelated apps', () => {
  const regOutput = [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '    Steam    REG_SZ    "C:\\Program Files (x86)\\Steam\\steam.exe" -silent',
    '    nl.twocode.assistent    REG_SZ    "C:\\Users\\Test\\AppData\\Local\\Programs\\TwoCode\\TwoCode.exe"',
    '    electron.app.Electron    REG_SZ    C:\\Users\\Test\\Masaüstü\\deneme\\node_modules\\electron\\dist\\electron.exe "C:\\Users\\Test\\Masaüstü\\deneme"',
    '    com.bedo.assistant    REG_SZ    "C:\\Users\\Test\\AppData\\Local\\Programs\\Bedo\\Bedo.exe"',
    '',
  ].join('\r\n');

  const entries = parseRegQueryRunOutput(regOutput);
  assert.equal(entries.length, 4);

  const existingFiles = new Set([
    'C:\\Program Files (x86)\\Steam\\steam.exe',
    'C:\\Users\\Test\\AppData\\Local\\Programs\\Bedo\\Bedo.exe',
  ]);

  const staleInDev = computeStaleRunValueNames(entries, {
    isPackaged: false,
    execPath: 'C:\\Users\\Test\\Masaüstü\\deneme\\node_modules\\electron\\dist\\electron.exe',
    appPath: 'C:\\Users\\Test\\Masaüstü\\deneme',
    fileExists: (p) => existingFiles.has(p),
  });

  assert.deepEqual(staleInDev, ['nl.twocode.assistent', 'electron.app.Electron']);
});

test('syncWindowsStartup never registers raw electron.exe in dev mode and registers cleanly when packaged', () => {
  let loginCalls = [];
  let cleanupCalls = 0;

  const devApp = {
    isPackaged: false,
    getAppPath: () => ROOT,
    setLoginItemSettings: (opts) => loginCalls.push(opts),
  };
  const devResult = syncWindowsStartup({
    app: devApp,
    enabled: true,
    platform: 'win32',
    cleanupFn: () => {
      cleanupCalls += 1;
      return [];
    },
  });
  assert.equal(devResult, false);
  assert.equal(cleanupCalls, 1);
  assert.equal(loginCalls.length, 0);

  const packagedApp = {
    isPackaged: true,
    getAppPath: () => 'C:\\Program Files\\Bedo\\resources\\app.asar',
    setLoginItemSettings: (opts) => loginCalls.push(opts),
  };
  const prodResult = syncWindowsStartup({
    app: packagedApp,
    enabled: true,
    platform: 'win32',
    cleanupFn: () => {
      cleanupCalls += 1;
      return [];
    },
  });
  assert.equal(prodResult, true);
  assert.equal(cleanupCalls, 2);
  assert.equal(loginCalls.length, 1);
  assert.deepEqual(loginCalls[0].args, []);
  assert.equal(loginCalls[0].openAtLogin, true);
});

test('main.cjs, styles.css, and watcher scripts enforce CPU/GPU optimization invariants', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  const watcherSrc = fs.readFileSync(path.join(ROOT, 'electron', 'win-system-watcher.ps1'), 'utf8');
  const bridgeHostSrc = fs.readFileSync(path.join(ROOT, 'electron', 'ghelper-bridge-host.ps1'), 'utf8');
  const bridgeModSrc = fs.readFileSync(path.join(ROOT, 'electron', 'ghelper-notification-bridge.psm1'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  // 1. Native occlusion must NOT be disabled
  assert.ok(!mainSrc.includes('CalculateNativeWinOcclusion'), 'CalculateNativeWinOcclusion must remain enabled');

  // 2. setIgnoreMouseEvents must NOT enable 100Hz Win32 cursor forwarding
  assert.ok(!/setIgnoreMouseEvents\(\s*true\s*,\s*\{\s*forward:\s*true\s*\}/.test(mainSrc));

  // 3. Working set eviction (EmptyWorkingSet / process.trimWorkingSet) must NOT run periodically
  assert.ok(!watcherSrc.includes('EmptyWorkingSet'), 'win-system-watcher.ps1 must not call EmptyWorkingSet');
  assert.ok(!watcherSrc.includes('TrimMemory'), 'win-system-watcher.ps1 must not call TrimMemory');
  assert.ok(!mainSrc.includes('process.trimWorkingSet()'), 'main.cjs must not force process.trimWorkingSet()');

  // 4. Mic endpoint must be cached in WinAudioHelper and brightness must be event-driven
  assert.ok(watcherSrc.includes('captureEndpoint'), 'WinAudioHelper must cache captureEndpoint');
  assert.ok(watcherSrc.includes('EnsureCaptureEndpoint'), 'GetMicMuted must reuse EnsureCaptureEndpoint');
  assert.ok(watcherSrc.includes('ManagementEventWatcher'), 'WinBrightnessHelper must use ManagementEventWatcher');
  assert.ok(!watcherSrc.includes('Register-WmiEvent'), 'PowerShell job-based Register-WmiEvent should be replaced by C# ManagementEventWatcher');

  // 5. No Process.GetProcessById snapshots in hot watcher/hook paths
  assert.ok(!watcherSrc.includes('GetProcessById'), 'WinWindowHelper must use QueryFullProcessImageName instead of Process.GetProcessById');
  assert.ok(!bridgeHostSrc.includes('GetProcessById'), 'GHelperOsdBridge must use QueryFullProcessImageName instead of Process.GetProcessById');
  assert.ok(!bridgeModSrc.includes('GetProcessById'), 'GHelperWindowHook must use QueryFullProcessImageName instead of Process.GetProcessById');

  // 6. GHelper bridge host must block on signal/timeout instead of 30ms spin loop
  assert.ok(!bridgeHostSrc.includes('Pump(30)'), 'ghelper-bridge-host.ps1 must not spin at 30ms');
  assert.ok(bridgeHostSrc.includes('Pump(4000)'), 'ghelper-bridge-host.ps1 must wait up to 4000ms in native C# MsgWaitForMultipleObjects');

  // 7. CSS animations must use compositor-only properties (no filter: brightness in eye pulses, no height in eqBar)
  const eqBarMatch = cssSrc.match(/@keyframes\s+eqBar\s*\{[\s\S]*?\n\}/);
  assert.ok(eqBarMatch && !eqBarMatch[0].includes('height:'), 'eqBar must animate transform: scaleY instead of layout height');
  const eyeGlowMatch = cssSrc.match(/@keyframes\s+roboEyeGlow\s*\{[\s\S]*?\n\}/);
  assert.ok(eyeGlowMatch && !eyeGlowMatch[0].includes('filter:'), 'roboEyeGlow must use compositor opacity instead of filter');

  // 8. Frameless overlay titlebar guard invariants (prevents intermittent white Win32 caption bar)
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!indexHtml.includes('Bedo Dynamic Island'), 'index.html must keep empty <title></title> so Win32 never paints caption text');
  assert.ok(mainSrc.includes('requestOverlayFramelessEnforcement'), 'main.cjs must enforce frameless Win32 style on mainWindow');
  assert.ok(watcherSrc.includes('EnforceFramelessOverlay'), 'WinWindowHelper must strip WS_CAPTION/WS_THICKFRAME/WS_SYSMENU');
});

test('PowerShell C# helpers in win-system-watcher.ps1 and ghelper-bridge-host.ps1 compile and execute cleanly', { skip: process.platform !== 'win32' }, () => {
  const watcherSrc = fs.readFileSync(path.join(ROOT, 'electron', 'win-system-watcher.ps1'), 'utf8');
  const addTypeBlocks = [...watcherSrc.matchAll(/Add-Type\s+(?:-ReferencedAssemblies\s+System\.Management\s+)?-TypeDefinition\s+@'\r?\n([\s\S]*?)\r?\n'@/g)];
  assert.equal(addTypeBlocks.length, 2, 'Expected WinAudioHelper/WinWindowHelper and WinBrightnessHelper C# blocks');

  const psVerifyScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${addTypeBlocks[0][1]}
'@
Add-Type -ReferencedAssemblies System.Management -TypeDefinition @'
${addTypeBlocks[1][1]}
'@
$alive = [WinWindowHelper]::IsParentProcessAlive($PID)
$fgApp = ''
$fgCat = ''
[WinWindowHelper]::GetForegroundAppContext(0, [ref]$fgApp, [ref]$fgCat)
$m1 = $false
$v1 = [WinAudioHelper]::GetVolume([ref]$m1)
$m2 = $false
$v2 = [WinAudioHelper]::GetVolume([ref]$m2)
$mic1 = $false
$r1 = [WinAudioHelper]::GetMicMuted([ref]$mic1)
$mic2 = $false
$r2 = [WinAudioHelper]::GetMicMuted([ref]$mic2)
[WinAudioHelper]::InvalidateAudioEndpoint()
$briEvent = [WinBrightnessHelper]::ConsumeBrightnessEvent()
[WinBrightnessHelper]::Reset()

Add-Type -AssemblyName System.Windows.Forms
$dummyForm = New-Object System.Windows.Forms.Form
$dummyForm.Text = 'Bedo Dynamic Island'
$dummyForm.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::SizableToolWindow
$dummyHwnd = $dummyForm.Handle.ToInt64()
$enforced = [WinWindowHelper]::EnforceFramelessOverlay($dummyHwnd, $true)
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class HwndCheck { [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m); }'
$afterStyle = [HwndCheck]::GetWindowLong([IntPtr]::new($dummyHwnd), -16)
$titleSb = New-Object System.Text.StringBuilder 64
[void][HwndCheck]::GetWindowText([IntPtr]::new($dummyHwnd), $titleSb, 64)
$dummyForm.Dispose()

@{
  alive = $alive
  volConsistent = ($v1 -eq $v2)
  micConsistent = ($r1 -eq $r2 -and $mic1 -eq $mic2)
  briEventDefault = $briEvent
  enforced = $enforced
  captionBitsRemaining = ($afterStyle -band 0x00CF0000)
  clearedTitle = $titleSb.ToString()
} | ConvertTo-Json -Compress
`;

  const runPsScriptFile = (scriptContent) => {
    const tmpFile = path.join(os.tmpdir(), `bedo-perf-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(tmpFile, scriptContent, 'utf8');
    try {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
        { encoding: 'utf8', timeout: 20000, windowsHide: true }
      ).trim();
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  };

  const out = runPsScriptFile(psVerifyScript);

  const parsed = JSON.parse(out.split(/\r?\n/).pop());
  assert.equal(parsed.alive, true);
  assert.equal(parsed.volConsistent, true);
  assert.equal(parsed.micConsistent, true);
  assert.equal(parsed.briEventDefault, -1);
  assert.equal(parsed.enforced, true);
  assert.equal(parsed.captionBitsRemaining, 0, 'All WS_CAPTION/WS_SYSMENU/WS_THICKFRAME bits must be stripped');
  assert.equal(parsed.clearedTitle, '');

  // Also verify GHelperOsdBridge and GHelperWindowHook C# blocks compile cleanly
  const bridgeHostSrc = fs.readFileSync(path.join(ROOT, 'electron', 'ghelper-bridge-host.ps1'), 'utf8');
  const bridgeHostBlock = bridgeHostSrc.match(/Add-Type\s+-TypeDefinition\s+@'\r?\n([\s\S]*?)\r?\n'@/);
  assert.ok(bridgeHostBlock, 'Expected GHelperOsdBridge C# block');

  const bridgeModSrc = fs.readFileSync(path.join(ROOT, 'electron', 'ghelper-notification-bridge.psm1'), 'utf8');
  const bridgeModBlock = bridgeModSrc.match(/Add-Type\s+-TypeDefinition\s+@'\r?\n([\s\S]*?)\r?\n'@/);
  assert.ok(bridgeModBlock, 'Expected GHelperWindowHook C# block');

  const psBridgeVerify = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${bridgeHostBlock[1]}
'@
Add-Type -TypeDefinition @'
${bridgeModBlock[1]}
'@
$isGh = [GHelperWindowHook]::IsGHelperProcess([uint32]$PID)
[GHelperOsdBridge]::Pump(15)
[GHelperOsdBridge]::Stop()
@{ ok = $true; selfIsGHelper = $isGh } | ConvertTo-Json -Compress
`;
  const outBridge = runPsScriptFile(psBridgeVerify);
  const parsedBridge = JSON.parse(outBridge.split(/\r?\n/).pop());
  assert.equal(parsedBridge.ok, true);
  assert.equal(parsedBridge.selfIsGHelper, false);
});
