export const DEFAULT_THEME = 'dark';
export const THEMES = Object.freeze(['dark', 'light']);
export const THEME_STORAGE_KEY = 'twocode-theme-preference';

export const LIGHT_DEFAULT_CLOCK_HEX = '#1e293b';
export const DARK_DEFAULT_CLOCK_HEX = '#ffffff';

export function normalizeTheme(value) {
  if (typeof value !== 'string') return DEFAULT_THEME;
  return value.trim().toLowerCase() === 'light' ? 'light' : 'dark';
}

export function isLightTheme(value) {
  return normalizeTheme(value) === 'light';
}

export function toggleTheme(value) {
  return isLightTheme(value) ? 'dark' : 'light';
}

export function parseHexRgb(hex) {
  if (typeof hex !== 'string') return null;
  const raw = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return null;
}

function toHexByte(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }) {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function isDefaultWhiteEyeColor(hex) {
  if (!hex || typeof hex !== 'string') return true;
  const cleaned = hex.trim().toLowerCase();
  return cleaned === '#fff' || cleaned === '#ffffff' || cleaned === 'white';
}

/**
 * Computes the Liquid Glass shell opacity (`--island-bg-opacity`) from `islandSeeThrough` (0..80).
 * - Dark Theme: preserves exact original curve (0.98 at 0%, 0.96 at 4%, down to 0.24 at 80%).
 * - Light Theme: starts genuinely translucent like frosted Liquid Glass (0.72 at 0%, 0.69 at 4%,
 *   down to 0.18 at 80%) so it never looks like flat opaque white paper.
 */
export function resolveShellBgOpacity(theme = DEFAULT_THEME, seeThrough = 4) {
  const pct = Math.min(80, Math.max(0, Number.isFinite(Number(seeThrough)) ? Number(seeThrough) : 4));
  if (isLightTheme(theme)) {
    return Math.max(0.18, 0.72 - (pct / 100) * 0.675);
  }
  return Math.max(0.24, 1 - (pct / 100) * 0.95);
}

/**
 * Boosts chroma & deepens overly washed-out RGB values (`"r, g, b"`) for the
 * bottom ambient Liquid Glass glow on light frosted surfaces.
 */
export function resolveLightAmbientRgb(rgbString, fallback = '66, 126, 232') {
  if (typeof rgbString !== 'string') return fallback;
  const parts = rgbString.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;

  let [r, g, b] = parts;
  const avg = (r + g + b) / 3;
  // Boost saturation so ambient color bloom stands out clearly through frosted light glass
  r = Math.round(avg + (r - avg) * 1.45);
  g = Math.round(avg + (g - avg) * 1.45);
  b = Math.round(avg + (b - avg) * 1.45);

  // Pull down excessive white-boosted brightness so it tints light glass richly instead of washing out
  const peak = Math.max(r, g, b, 1);
  if (peak > 215) {
    const scale = 205 / peak;
    r = Math.round(r * scale);
    g = Math.round(g * scale);
    b = Math.round(b * scale);
  }

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `${r}, ${g}, ${b}`;
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function mixRgb(a, b, weightA = 0.5) {
  const w = Math.max(0, Math.min(1, weightA));
  return {
    r: Math.round(a.r * w + b.r * (1 - w)),
    g: Math.round(a.g * w + b.g * (1 - w)),
    b: Math.round(a.b * w + b.b * (1 - w)),
  };
}

/**
 * Ensures a hex accent/clock color stays vivid and legible on frosted light surfaces
 * using HSL chroma preservation & jewel-tone lightness clamping.
 */
export function adaptHexForLightSurface(hex, fallbackHex = LIGHT_DEFAULT_CLOCK_HEX) {
  const rgb = parseHexRgb(hex);
  if (!rgb) return fallbackHex;

  const hsl = rgbToHsl(rgb);
  const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  const lum = relativeLuminance(rgb);

  if (chroma < 18 && lum > 0.65) {
    return fallbackHex;
  }

  // Already rich and dark enough for crisp contrast on light glass
  if (lum <= 0.42) {
    return rgbToHex(rgb);
  }

  const nextH = hsl.h;
  const nextS = Math.min(0.9, Math.max(hsl.s * 1.25, 0.58));
  let nextL = Math.min(hsl.l, 0.42);
  let candidate = hslToRgb({ h: nextH, s: nextS, l: nextL });
  while (relativeLuminance(candidate) > 0.42 && nextL > 0.24) {
    nextL -= 0.03;
    candidate = hslToRgb({ h: nextH, s: nextS, l: nextL });
  }

  return rgbToHex(candidate);
}

export function resolveEffectiveClockColor({
  theme = DEFAULT_THEME,
  userPickedClockColor = false,
  clockColor = DARK_DEFAULT_CLOCK_HEX,
  isLiveCover = false,
  islandMusicColour = true,
  musicAccentHex = DARK_DEFAULT_CLOCK_HEX,
} = {}) {
  const light = isLightTheme(theme);

  if (userPickedClockColor) {
    if (!light) return clockColor || DARK_DEFAULT_CLOCK_HEX;
    const parsed = parseHexRgb(clockColor);
    if (!parsed) return LIGHT_DEFAULT_CLOCK_HEX;
    if (relativeLuminance(parsed) > 0.72) {
      return adaptHexForLightSurface(clockColor, LIGHT_DEFAULT_CLOCK_HEX);
    }
    return clockColor;
  }

  if (isLiveCover && islandMusicColour !== false && musicAccentHex) {
    if (!light) return musicAccentHex;
    // Vivid jewel-toned media ambient color directly from the live cover art
    return adaptHexForLightSurface(musicAccentHex, LIGHT_DEFAULT_CLOCK_HEX);
  }

  return light ? LIGHT_DEFAULT_CLOCK_HEX : DARK_DEFAULT_CLOCK_HEX;
}

export function resolveIslandPreviewFill(theme = DEFAULT_THEME, opacity = 0.69) {
  const alpha = Number.isFinite(Number(opacity))
    ? Math.max(0.18, Math.min(1, Number(opacity)))
    : isLightTheme(theme)
      ? 0.69
      : 0.96;
  return isLightTheme(theme)
    ? `linear-gradient(172deg, rgba(255, 255, 255, 0.32) 0%, transparent 55%), rgba(232, 239, 250, ${alpha.toFixed(2)})`
    : `rgba(10, 13, 20, ${alpha.toFixed(2)})`;
}
