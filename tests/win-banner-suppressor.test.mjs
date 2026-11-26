import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWindowsBannerSuppressor, isExcludedAppId } = require('../electron/win-banner-suppressor.cjs');

function createMockRegistry(initialState = {}) {
  // Map<appId, Map<valueName, number>>
  const store = new Map();
  for (const [appId, values] of Object.entries(initialState)) {
    store.set(appId, new Map(Object.entries(values)));
  }
  let calls = 0;

  async function registryAdapter(req) {
    calls += 1;
    if (req.action === 'suppress') {
      const excludeLower = new Set((req.excludeAppIds || []).map((x) => String(x).toLowerCase()));
      const targets = new Set();
      if (req.discoverExisting) {
        for (const existingKey of store.keys()) {
          if (!excludeLower.has(existingKey.toLowerCase())) {
            targets.add(existingKey);
          }
        }
      }
      for (const id of req.appIds || []) {
        if (id && !excludeLower.has(String(id).toLowerCase())) {
          targets.add(id);
        }
      }
      const snapshots = {};
      let appliedCount = 0;
      for (const appId of targets) {
        const sub = store.get(appId);
        const keyExisted = Boolean(sub);
        const hadShowBanner = Boolean(sub && sub.has('ShowBanner'));
        const previousValue = hadShowBanner ? sub.get('ShowBanner') : null;
        snapshots[appId] = { keyExisted, hadShowBanner, previousValue };
        const nextSub = sub || new Map();
        nextSub.set('ShowBanner', 0);
        store.set(appId, nextSub);
        appliedCount += 1;
      }
      return { ok: true, appliedCount, snapshots, errors: [] };
    }

    if (req.action === 'restore') {
      const restored = [];
      for (const [appId, orig] of Object.entries(req.entries || {})) {
        const sub = store.get(appId);
        if (!sub) {
          restored.push(appId);
          continue;
        }
        if (orig.hadShowBanner && orig.previousValue !== null && orig.previousValue !== undefined) {
          sub.set('ShowBanner', Number(orig.previousValue));
        } else {
          sub.delete('ShowBanner');
          if (!orig.keyExisted && sub.size === 0) {
            store.delete(appId);
          }
        }
        restored.push(appId);
      }
      return { ok: true, restored, failed: {} };
    }

    throw new Error(`Unexpected action: ${req.action}`);
  }

  return {
    store,
    getCalls: () => calls,
    registryAdapter,
  };
}

test('preserves user pre-existing ShowBanner=0 apps and restores unset/new apps cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bedo-banner-test-'));
  const backupFilePath = path.join(tmpDir, 'windows-banner-backup.json');

  try {
    const mock = createMockRegistry({
      'Microsoft.ScreenSketch_8wekyb3d8bbwe!App': { LastNotificationAddedTime: 100, ShowBanner: 0 },
      Chrome: { LastNotificationAddedTime: 200 },
      'com.bedo.assistant': { LastNotificationAddedTime: 300 },
    });

    const suppressor = createWindowsBannerSuppressor({
      backupFilePath,
      registryAdapter: mock.registryAdapter,
      readWpnToastAppIds: () => [
        'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
        'C:/ProgramData/ASUS/AsusSurvey/AsusSurvey.exe',
        'com.bedo.assistant',
      ],
    });

    const enableRes = await suppressor.enable();
    assert.equal(enableRes.ok, true);
    assert.equal(enableRes.active, true);
    assert.equal(enableRes.suppressedCount, 4);

    // Bedo itself must never be suppressed
    assert.equal(mock.store.get('com.bedo.assistant').has('ShowBanner'), false);
    // Target apps must have ShowBanner=0
    assert.equal(mock.store.get('Chrome').get('ShowBanner'), 0);
    assert.equal(mock.store.get('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify').get('ShowBanner'), 0);
    assert.equal(mock.store.get('C:/ProgramData/ASUS/AsusSurvey/AsusSurvey.exe').get('ShowBanner'), 0);

    // Simulate app restart / repeated enable() while already active (idempotency check!)
    const suppressorAfterRestart = createWindowsBannerSuppressor({
      backupFilePath,
      registryAdapter: mock.registryAdapter,
      readWpnToastAppIds: () => ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'],
    });
    await suppressorAfterRestart.enable();

    // Disable and verify exact restoration
    const disableRes = await suppressorAfterRestart.disable();
    assert.equal(disableRes.ok, true);
    assert.equal(disableRes.active, false);
    assert.equal(disableRes.suppressedCount, 0);

    // ScreenSketch originally had ShowBanner=0 -> must remain 0!
    assert.equal(
      mock.store.get('Microsoft.ScreenSketch_8wekyb3d8bbwe!App').get('ShowBanner'),
      0
    );
    // Chrome originally existed without ShowBanner -> key kept, ShowBanner deleted!
    assert.equal(mock.store.has('Chrome'), true);
    assert.equal(mock.store.get('Chrome').has('ShowBanner'), false);
    assert.equal(mock.store.get('Chrome').get('LastNotificationAddedTime'), 200);
    // Newly created empty keys -> completely removed!
    assert.equal(mock.store.has('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'), false);
    assert.equal(mock.store.has('C:/ProgramData/ASUS/AsusSurvey/AsusSurvey.exe'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('auto-catches newly arriving AppIds in O(1) when cached and restores them on disable', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bedo-banner-autocatch-'));
  const backupFilePath = path.join(tmpDir, 'windows-banner-backup.json');

  try {
    const mock = createMockRegistry({
      Chrome: { LastNotificationAddedTime: 1 },
    });

    const suppressor = createWindowsBannerSuppressor({
      backupFilePath,
      registryAdapter: mock.registryAdapter,
      readWpnToastAppIds: () => [],
    });

    await suppressor.enable();
    const callsAfterEnable = mock.getCalls();

    // Already suppressed AppId must be an instant cache hit with zero registry spawns
    const cachedRes = await suppressor.ensureAppSuppressed('Chrome');
    assert.equal(cachedRes.alreadySuppressed, true);
    assert.equal(mock.getCalls(), callsAfterEnable);

    // Excluded AppId is skipped
    assert.equal(isExcludedAppId('com.bedo.assistant'), true);
    const skippedRes = await suppressor.ensureAppSuppressed('com.bedo.assistant');
    assert.equal(skippedRes.skipped, true);
    assert.equal(mock.getCalls(), callsAfterEnable);

    // Brand-new AppId gets suppressed and added to backup
    mock.store.set('Discord.Discord', new Map([['LastNotificationAddedTime', 999]]));
    const newAppRes = await suppressor.ensureAppSuppressed('Discord.Discord');
    assert.equal(newAppRes.ok, true);
    assert.equal(newAppRes.suppressedCount, 2);
    assert.equal(mock.store.get('Discord.Discord').get('ShowBanner'), 0);

    // syncWithSettings restores automatically if windowsNotifications is false
    await suppressor.syncWithSettings({
      suppressWindowsBanners: true,
      windowsNotifications: false,
    });
    assert.equal(mock.store.get('Discord.Discord').has('ShowBanner'), false);
    assert.equal(suppressor.getStatusSync().active, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('real Windows .NET Registry worker handles forward-slash and standard AppIds cleanly', { skip: process.platform !== 'win32' }, async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bedo-banner-win32-'));
  const backupFilePath = path.join(tmpDir, 'windows-banner-backup.json');
  const dummyStandard = 'Bedo.__UnitTestDummy_7f9a2b__';
  const dummySlash = 'C:/BedoUnitTestDummy_7f9a2b/app.exe';

  const cleanupPs = `
$root = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', $true)
if ($null -ne $root) {
  try { $root.DeleteSubKeyTree('${dummyStandard}', $false) } catch {}
  try { $root.DeleteSubKeyTree('${dummySlash}', $false) } catch {}
  $root.Close()
}
`;

  try {
    // Test ONLY the isolated dummy keys (discoverExisting: false via ensureAppSuppressed after empty enable)
    const suppressor = createWindowsBannerSuppressor({
      backupFilePath,
      readWpnToastAppIds: () => [],
    });

    // Seed an active backup state with zero entries so we never touch any real user app key during unit test!
    fs.writeFileSync(
      backupFilePath,
      JSON.stringify({ version: 1, active: true, updatedAt: Date.now(), entries: {} }),
      'utf8'
    );

    await suppressor.ensureAppSuppressed(dummyStandard);
    await suppressor.ensureAppSuppressed(dummySlash);

    const verifyOut = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$r = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', $false);
         $s1 = $r.OpenSubKey('${dummyStandard}', $false);
         $s2 = $r.OpenSubKey('${dummySlash}', $false);
         $v1 = if ($s1) { $s1.GetValue('ShowBanner', $null) } else { $null };
         $v2 = if ($s2) { $s2.GetValue('ShowBanner', $null) } else { $null };
         if ($s1) { $s1.Close() }; if ($s2) { $s2.Close() }; $r.Close();
         @{ v1 = $v1; v2 = $v2 } | ConvertTo-Json -Compress`,
      ],
      { encoding: 'utf8' }
    ).trim();

    const parsed = JSON.parse(verifyOut);
    assert.equal(parsed.v1, 0);
    assert.equal(parsed.v2, 0);

    // Restore and confirm both dummy keys were completely deleted without residue
    const restoreRes = await suppressor.disable();
    assert.equal(restoreRes.ok, true);

    const afterOut = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$r = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', $false);
         $s1 = $r.OpenSubKey('${dummyStandard}', $false);
         $s2 = $r.OpenSubKey('${dummySlash}', $false);
         $e1 = ($null -ne $s1); $e2 = ($null -ne $s2);
         if ($s1) { $s1.Close() }; if ($s2) { $s2.Close() }; $r.Close();
         @{ e1 = $e1; e2 = $e2 } | ConvertTo-Json -Compress`,
      ],
      { encoding: 'utf8' }
    ).trim();

    const afterParsed = JSON.parse(afterOut);
    assert.equal(afterParsed.e1, false);
    assert.equal(afterParsed.e2, false);
  } finally {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cleanupPs]);
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
