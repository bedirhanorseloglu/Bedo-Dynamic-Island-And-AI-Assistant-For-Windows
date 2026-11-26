import { RELEASES, getReleaseByVersion, getLatestRelease } from './releasesData.mjs';

export function normalizeSemver(version) {
  const cleaned = String(version || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+/.test(cleaned)) return '';
  return cleaned.split('-')[0];
}

export function compareSemver(a, b) {
  const na = normalizeSemver(a);
  const nb = normalizeSemver(b);
  if (!na && !nb) return 0;
  if (!na) return -1;
  if (!nb) return 1;
  const pa = na.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = nb.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Resolves which release entry should be showcased for the running app version.
 * Falls back to the latest defined release if it is <= currentVersion.
 */
export function resolveActiveRelease(currentVersion, releases = RELEASES) {
  const normCurrent = normalizeSemver(currentVersion);
  if (!normCurrent) return getLatestRelease();
  const exact = getReleaseByVersion(normCurrent);
  if (exact) return exact;
  const eligible = (releases || []).find(
    (r) => compareSemver(r.version, normCurrent) <= 0
  );
  return eligible || null;
}

/**
 * Determines whether the user has an unseen release showcase.
 * Rules:
 * - Never trigger during initial onboarding (onboardingCompleted === false).
 * - Never trigger if there is no matching release entry.
 * - Trigger when lastSeenReleaseVersion is empty or older than the resolved release version.
 */
export function hasUnseenRelease({
  currentVersion,
  lastSeenReleaseVersion,
  onboardingCompleted,
  releases = RELEASES,
} = {}) {
  if (onboardingCompleted === false) return false;
  const release = resolveActiveRelease(currentVersion, releases);
  if (!release) return false;
  const seen = normalizeSemver(lastSeenReleaseVersion);
  if (!seen) return true;
  return compareSemver(release.version, seen) > 0;
}
