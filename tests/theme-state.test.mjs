import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  THEMES,
  LIGHT_DEFAULT_CLOCK_HEX,
  DARK_DEFAULT_CLOCK_HEX,
  normalizeTheme,
  isLightTheme,
  toggleTheme,
  isDefaultWhiteEyeColor,
  adaptHexForLightSurface,
  resolveEffectiveClockColor,
  resolveIslandPreviewFill,
  resolveShellBgOpacity,
  resolveLightAmbientRgb,
  relativeLuminance,
  parseHexRgb,
} from '../src/theme/themeState.mjs';

test('default theme is dark and normalizeTheme handles arbitrary inputs safely', () => {
  assert.equal(DEFAULT_THEME, 'dark');
  assert.deepEqual(THEMES, ['dark', 'light']);
  assert.equal(normalizeTheme(undefined), 'dark');
  assert.equal(normalizeTheme(null), 'dark');
  assert.equal(normalizeTheme(''), 'dark');
  assert.equal(normalizeTheme('DARK'), 'dark');
  assert.equal(normalizeTheme('system'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('  Light '), 'light');
  assert.equal(isLightTheme('light'), true);
  assert.equal(isLightTheme('dark'), false);
});

test('toggleTheme flips cleanly between dark and light', () => {
  assert.equal(toggleTheme('dark'), 'light');
  assert.equal(toggleTheme('light'), 'dark');
  assert.equal(toggleTheme(undefined), 'light');
});

test('resolveShellBgOpacity keeps dark mode curve intact and makes light mode genuinely translucent Liquid Glass', () => {
  assert.equal(Number(resolveShellBgOpacity('dark', 4).toFixed(2)), 0.96);
  assert.equal(Number(resolveShellBgOpacity('dark', 40).toFixed(2)), 0.62);

  // Light mode is translucent right out of the box and scales smoothly down to 0.18
  const lightDefault = resolveShellBgOpacity('light', 4);
  const lightMid = resolveShellBgOpacity('light', 40);
  const lightMax = resolveShellBgOpacity('light', 80);
  assert.ok(lightDefault < 0.72 && lightDefault > 0.64);
  assert.ok(lightMid < lightDefault);
  assert.equal(Number(lightMax.toFixed(2)), 0.18);
});

test('resolveLightAmbientRgb boosts saturation so bottom ambient gradient is vivid on light glass', () => {
  const boosted = resolveLightAmbientRgb('205, 165, 120');
  const [r, g, b] = boosted.split(',').map((s) => Number(s.trim()));
  assert.ok(r > b, 'warm amber hue preserved and deepened');
  assert.ok(r - b > 205 - 120, 'chroma boosted for light glass visibility');
});

test('isDefaultWhiteEyeColor identifies uncustomized white eyes while preserving custom colors', () => {
  assert.equal(isDefaultWhiteEyeColor(undefined), true);
  assert.equal(isDefaultWhiteEyeColor('#ffffff'), true);
  assert.equal(isDefaultWhiteEyeColor('#FFF'), true);
  assert.equal(isDefaultWhiteEyeColor('#38bdf8'), false);
  assert.equal(isDefaultWhiteEyeColor('#22c55e'), false);
});

test('adaptHexForLightSurface darkens overly bright colors while keeping rich accents intact', () => {
  assert.equal(adaptHexForLightSurface('#ffffff'), LIGHT_DEFAULT_CLOCK_HEX);
  assert.equal(adaptHexForLightSurface('#f8fafc'), LIGHT_DEFAULT_CLOCK_HEX);

  const adaptedPastel = adaptHexForLightSurface('#bae6fd');
  const rgbPastel = parseHexRgb(adaptedPastel);
  assert.ok(rgbPastel);
  assert.ok(relativeLuminance(rgbPastel) <= 0.45);
  assert.ok(rgbPastel.b > rgbPastel.r, 'preserves sky-blue hue direction');

  assert.equal(adaptHexForLightSurface('#2563eb'), '#2563eb');
});

test('resolveEffectiveClockColor preserves dark mode 1:1 and adapts light mode legibly', () => {
  assert.equal(
    resolveEffectiveClockColor({
      theme: 'dark',
      userPickedClockColor: false,
      isLiveCover: false,
    }),
    DARK_DEFAULT_CLOCK_HEX
  );

  assert.equal(
    resolveEffectiveClockColor({
      theme: 'dark',
      userPickedClockColor: false,
      isLiveCover: true,
      islandMusicColour: true,
      musicAccentHex: '#f9a8d4',
    }),
    '#f9a8d4'
  );

  assert.equal(
    resolveEffectiveClockColor({
      theme: 'light',
      userPickedClockColor: false,
      isLiveCover: false,
    }),
    LIGHT_DEFAULT_CLOCK_HEX
  );

  const liveLightHex = resolveEffectiveClockColor({
    theme: 'light',
    userPickedClockColor: false,
    isLiveCover: true,
    islandMusicColour: true,
    musicAccentHex: '#fef08a',
  });
  assert.ok(relativeLuminance(parseHexRgb(liveLightHex)) <= 0.45);

  // Live media cover art gives the clock a vivid chroma-rich ambient color (not washed out to grey)
  const orangeCoverClock = resolveEffectiveClockColor({
    theme: 'light',
    userPickedClockColor: false,
    isLiveCover: true,
    islandMusicColour: true,
    musicAccentHex: '#e59a54',
  });
  const orangeRgb = parseHexRgb(orangeCoverClock);
  assert.ok(orangeRgb.r > orangeRgb.b + 60, 'preserves vivid warm media ambient color on clock');
  assert.ok(relativeLuminance(orangeRgb) <= 0.45, 'stays crisp and legible on light glass');

  assert.equal(
    resolveEffectiveClockColor({
      theme: 'light',
      userPickedClockColor: true,
      clockColor: '#ef4444',
    }),
    '#ef4444'
  );
  assert.equal(
    resolveEffectiveClockColor({
      theme: 'light',
      userPickedClockColor: true,
      clockColor: '#ffffff',
    }),
    LIGHT_DEFAULT_CLOCK_HEX
  );
});

test('resolveIslandPreviewFill returns dark or frosted Liquid Glass fill string with clamped opacity', () => {
  assert.equal(resolveIslandPreviewFill('dark', 0.96), 'rgba(10, 13, 20, 0.96)');
  assert.match(resolveIslandPreviewFill('light', 0.69), /rgba\(232, 239, 250, 0\.69\)/);
  assert.match(resolveIslandPreviewFill('light', 0.05), /rgba\(232, 239, 250, 0\.18\)/);
});
