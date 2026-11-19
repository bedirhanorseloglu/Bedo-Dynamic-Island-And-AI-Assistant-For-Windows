import React from 'react';
import { CLOCK_FONT_FAMILIES } from './typography';
import { useI18n } from './i18n';
export { CLOCK_FONT_FAMILIES } from './typography';

export default function HeroClock({
  timeStr = '04:24',
  suffix = '',
  fontIndex = 1,
  color = '#ffffff',
  scale = 1,
  onClick,
  size = 'hero',
}) {
  const { t } = useI18n();
  const chars = timeStr.split('');
  const fontFamily = CLOCK_FONT_FAMILIES[fontIndex] || CLOCK_FONT_FAMILIES[1];
  const isDottedMono = fontIndex === 3;

  return (
    <div
      className={`hero-clock ${size === 'focus' ? 'focus-size' : ''} ${
        isDottedMono ? 'dotted-mono' : ''
      }`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      aria-label={onClick ? t('clock.ariaLabel', { time: timeStr, suffix: suffix ? ` ${suffix}` : '' }) : undefined}
      title={onClick ? t('clock.title') : undefined}
      style={{
        fontFamily,
        color,
        '--clock-glass-color': color,
        fontSize: size === 'focus' ? undefined : `clamp(${Math.round(104 * scale)}px, ${(18.2 * scale).toFixed(2)}vw, ${Math.round(166 * scale)}px)`,
      }}
    >
      {chars.map((ch, idx) => {
        if (ch === ':') {
          return (
            <span key={idx} className="hero-clock-colon">
              <i />
              <i />
            </span>
          );
        }
        return (
          <span
            key={idx}
            className={`hero-clock-digit ${ch === '0' && isDottedMono ? 'is-zero' : ''}`}
          >
            {ch}
          </span>
        );
      })}
      {suffix && <span className="hero-clock-suffix">{suffix}</span>}
    </div>
  );
}
