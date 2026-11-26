import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASES, getReleaseByVersion, getLatestRelease } from '../src/releases/releasesData.mjs';
import {
  normalizeSemver,
  compareSemver,
  resolveActiveRelease,
  hasUnseenRelease,
} from '../src/releases/releaseState.mjs';
import { shouldPersistNotification } from '../src/notification-history-policy.mjs';
import { resolveRoboAppearance } from '../src/roboAppearance.mjs';

test('normalizeSemver and compareSemver handle standard and v-prefixed versions', () => {
  assert.equal(normalizeSemver('v1.0.11'), '1.0.11');
  assert.equal(normalizeSemver('1.2.3-beta.1'), '1.2.3');
  assert.equal(normalizeSemver('invalid'), '');
  assert.equal(compareSemver('1.0.12', '1.0.11'), 1);
  assert.equal(compareSemver('1.0.11', '1.0.11'), 0);
  assert.equal(compareSemver('1.0.9', '1.0.11'), -1);
});

test('hasUnseenRelease suppresses during onboarding and detects unseen upgrades cleanly', () => {
  const sampleReleases = [
    { version: '1.0.12', headline: { tr: 'Yeni', en: 'New' }, highlights: [] },
    { version: '1.0.11', headline: { tr: 'Önceki', en: 'Prev' }, highlights: [] },
  ];

  // Fresh install still in onboarding must never trigger What's New
  assert.equal(
    hasUnseenRelease({
      currentVersion: '1.0.12',
      lastSeenReleaseVersion: '',
      onboardingCompleted: false,
      releases: sampleReleases,
    }),
    false
  );

  // Upgraded user from 1.0.11 -> 1.0.12 sees What's New
  assert.equal(
    hasUnseenRelease({
      currentVersion: '1.0.12',
      lastSeenReleaseVersion: '1.0.11',
      onboardingCompleted: true,
      releases: sampleReleases,
    }),
    true
  );

  // Already seen 1.0.12 -> false
  assert.equal(
    hasUnseenRelease({
      currentVersion: '1.0.12',
      lastSeenReleaseVersion: '1.0.12',
      onboardingCompleted: true,
      releases: sampleReleases,
    }),
    false
  );

  // Hotfix 1.0.13 without a dedicated 1.0.13 card resolves to 1.0.12; if 1.0.12 was already seen -> false
  assert.equal(resolveActiveRelease('1.0.13', sampleReleases)?.version, '1.0.12');
  assert.equal(
    hasUnseenRelease({
      currentVersion: '1.0.13',
      lastSeenReleaseVersion: '1.0.12',
      onboardingCompleted: true,
      releases: sampleReleases,
    }),
    false
  );
});

test('releasesData entries have bilingual concise copy and release-whats-new toast is not persisted', () => {
  assert.ok(RELEASES.length >= 1);
  const latest = getLatestRelease();
  assert.equal(getReleaseByVersion(`v${latest.version}`)?.version, latest.version);
  for (const rel of RELEASES) {
    assert.ok(rel.headline?.tr && rel.headline?.en);
    assert.ok(Array.isArray(rel.highlights) && rel.highlights.length > 0 && rel.highlights.length <= 4);
    for (const h of rel.highlights) {
      assert.ok(h.title?.tr && h.title?.en);
      assert.ok(h.subtitle?.tr && h.subtitle?.en);
    }
  }

  assert.equal(
    shouldPersistNotification({
      id: 'release_whats_new_1.0.11',
      app: 'Bedo',
      notificationKind: 'release-whats-new',
      title: 'Bedo v1.0.11',
      body: 'Yenilikleri gör',
    }),
    false
  );
});

test('resolveRoboAppearance reflects user custom Bedo and falls back to Night/None/White when unset', () => {
  const fallback = resolveRoboAppearance({});
  assert.equal(fallback.outfit, 'None');
  assert.equal(fallback.bodyColor, 'Night');
  assert.equal(fallback.eyeColorHex, '#ffffff');
  assert.equal(fallback.cssVars['--robo-body-hex'], '#27272a');

  const custom = resolveRoboAppearance({
    outfit: 'Sunglasses',
    bodyColor: 'Purple',
    eyeColorHex: '#a7f3d0',
    seasonalOutfits: true,
  });
  assert.equal(custom.outfit, 'Sunglasses');
  assert.equal(custom.bodyColor, 'Purple');
  assert.equal(custom.eyeColorHex, '#a7f3d0');
  assert.equal(custom.seasonalOutfits, true);
  assert.equal(custom.cssVars['--robo-eye-color'], '#a7f3d0');
  assert.equal(custom.cssVars['--robo-body-hex'], '#8b5cf6');
});
