import React, { useId } from 'react';
import { resolveRoboAppearance } from '../roboAppearance.mjs';

/**
 * Dynamic Bedo squircle avatar mark that reflects the user's personalized Bedo
 * (bodyColor, eyeColorHex, outfit), falling back to Night / White / None only when unset.
 */
export default function BedoLogoMark({
  size = 28,
  appearance,
  className = '',
}) {
  const uid = useId().replace(/:/g, '');
  const resolved = resolveRoboAppearance(appearance);
  const bodyGradId = `bedoBody_${uid}`;
  const sheenGradId = `bedoSheen_${uid}`;
  const eyeGlowId = `bedoEyeGlow_${uid}`;
  const isNight = resolved.bodyColor === 'Night';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bodyGradId} x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isNight ? '#262930' : resolved.bodyHex} />
          <stop offset="52%" stopColor={isNight ? '#14161B' : '#14161B'} />
          <stop offset="100%" stopColor="#090A0D" />
        </linearGradient>
        <linearGradient id={sheenGradId} x1="8" y1="4" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
        </linearGradient>
        <filter id={eyeGlowId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer squircle tinted by user's Bedo body color */}
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${bodyGradId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="14.25"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
      />

      {/* Subtle glass reflection */}
      <path
        d="M17 3.5H47C54.4558 3.5 60.5 9.54416 60.5 17V21C46.5 29.5 27.5 34.5 3.5 31V17C3.5 9.54416 9.54416 3.5 17 3.5Z"
        fill={`url(#${sheenGradId})`}
      />

      {/* Optional user outfit accent */}
      {resolved.outfit === 'Crown' && (
        <polygon
          points="22,19 22,12 27,16 32,10 37,16 42,12 42,19"
          fill="#fbbf24"
          stroke="#fde047"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}
      {resolved.outfit === 'Halo' && (
        <ellipse cx="32" cy="14" rx="11" ry="3.2" fill="none" stroke="#fde047" strokeWidth="2.2" />
      )}
      {resolved.outfit === 'Party hat' && (
        <polygon points="25,19 32,9 39,19" fill="#a855f7" stroke="#f472b6" strokeWidth="1.3" strokeLinejoin="round" />
      )}
      {resolved.outfit === 'Beanie' && (
        <path d="M21 19 C21 11, 43 11, 43 19 Z" fill="#f97316" />
      )}

      {/* Inner visor pill */}
      <rect
        x="14"
        y="22"
        width="36"
        height="22"
        rx="11"
        fill="#030305"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />

      {/* User's personalized eye color */}
      <g filter={`url(#${eyeGlowId})`}>
        <rect x="23.5" y="27.5" width="5.2" height="11" rx="2.6" fill={resolved.eyeColorHex} />
        <rect x="35.3" y="27.5" width="5.2" height="11" rx="2.6" fill={resolved.eyeColorHex} />
      </g>

      {resolved.outfit === 'Sunglasses' && (
        <g>
          <rect x="19.5" y="27" width="11" height="8" rx="2.5" fill="rgba(10,12,18,0.92)" stroke="#e2e8f0" strokeWidth="1.4" />
          <rect x="33.5" y="27" width="11" height="8" rx="2.5" fill="rgba(10,12,18,0.92)" stroke="#e2e8f0" strokeWidth="1.4" />
          <line x1="30.5" y1="30.5" x2="33.5" y2="30.5" stroke="#e2e8f0" strokeWidth="1.5" />
        </g>
      )}
      {resolved.outfit === 'Bowtie' && (
        <g>
          <polygon points="25,47 32,50 25,53" fill="#f43f5e" />
          <polygon points="39,47 32,50 39,53" fill="#f43f5e" />
          <circle cx="32" cy="50" r="2" fill="#fda4af" />
        </g>
      )}
    </svg>
  );
}
