import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { isLightTheme, normalizeTheme, toggleTheme } from '../../theme/themeState.mjs';
import './theme-selector.css';

export function ThemeSelector({ theme, onChange, langCode = 'en' }) {
  const current = normalizeTheme(theme);
  const isTr = langCode === 'tr';

  const options = [
    {
      value: 'dark',
      label: isTr ? 'Koyu' : 'Dark',
      icon: Moon,
    },
    {
      value: 'light',
      label: isTr ? 'Açık' : 'Light',
      icon: Sun,
    },
  ];

  return (
    <div className="bedo-theme-segmented" role="group" aria-label={isTr ? 'Tema seçimi' : 'Theme selection'}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`bedo-theme-seg-btn ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => {
              if (opt.value !== current && typeof onChange === 'function') {
                onChange(opt.value);
              }
            }}
          >
            <span className={`bedo-theme-swatch is-${opt.value}`} aria-hidden="true">
              <Icon size={12} strokeWidth={2.2} />
            </span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SidebarThemeToggleButton({ theme, onToggle, langCode = 'en' }) {
  const light = isLightTheme(theme);
  const isTr = langCode === 'tr';
  const label = light
    ? (isTr ? 'Koyu temaya geç' : 'Switch to Dark Theme')
    : (isTr ? 'Açık temaya geç' : 'Switch to Light Theme');

  return (
    <button
      type="button"
      className={`sidebar-theme-btn ${light ? 'is-light' : 'is-dark'}`}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof onToggle === 'function') {
          onToggle(toggleTheme(theme));
        }
      }}
      title={label}
      aria-label={label}
    >
      {light ? <Moon size={15} strokeWidth={2.1} /> : <Sun size={15} strokeWidth={2.1} />}
    </button>
  );
}

export default ThemeSelector;
