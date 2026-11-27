import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  normalizeTheme,
} from './themeState.mjs';
import './light-shell-and-hud.css';
import './light-island-tabs.css';
import './light-settings.css';

export function readStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return normalizeTheme(raw);
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistStoredTheme(theme) {
  const normalized = normalizeTheme(theme);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {}
  }
  return normalized;
}

export function applyThemeToDocument(theme, { persist = true } = {}) {
  const normalized = normalizeTheme(theme);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
  }
  if (persist) {
    persistStoredTheme(normalized);
  }
  return normalized;
}

let storageListenerBound = false;

export function initializeTheme() {
  const initial = readStoredTheme();
  applyThemeToDocument(initial, { persist: false });

  if (typeof window !== 'undefined' && !storageListenerBound) {
    storageListenerBound = true;
    window.addEventListener('storage', (event) => {
      if (event.key === THEME_STORAGE_KEY && event.newValue) {
        applyThemeToDocument(event.newValue, { persist: false });
      }
    });
  }

  return initial;
}
