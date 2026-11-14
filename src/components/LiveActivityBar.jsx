import React from 'react';
import { ArrowDown, Check, Gamepad2, Video } from 'lucide-react';

export function IdleLiveActivityPill({ liveActivity }) {
  if (!liveActivity?.active) return null;
  const hasPercent = typeof liveActivity.percent === 'number' && Number.isFinite(liveActivity.percent);
  const pct = liveActivity.done ? 100 : hasPercent ? Math.max(0, Math.min(100, Math.round(liveActivity.percent))) : null;
  const isIndeterminate = pct == null && !liveActivity.done;
  const pctWidth = liveActivity.done ? 100 : (pct ?? 42);

  return (
    <div
      className={`idle-live-activity ${liveActivity.done ? 'is-done' : ''} ${isIndeterminate ? 'is-indeterminate' : ''}`}
      title={liveActivity.title}
    >
      <div
        className={`idle-live-liquid-fill ${isIndeterminate ? 'is-indeterminate' : ''}`}
        style={{ width: `${pctWidth}%` }}
        aria-hidden="true"
      />

      <span className="idle-live-icon" aria-hidden="true">
        {liveActivity.done ? (
          <Check size={11} strokeWidth={2.8} />
        ) : liveActivity.kind === 'steam' ? (
          <Gamepad2 size={11} strokeWidth={2.3} />
        ) : (
          <ArrowDown size={11} strokeWidth={2.6} />
        )}
      </span>

      <span className="idle-live-title">{liveActivity.title}</span>

      <span className="idle-live-pct mono">
        {liveActivity.done
          ? '%100'
          : pct != null
          ? `%${pct}`
          : `${liveActivity.downloadedMB ?? 0} MB`}
      </span>
    </div>
  );
}

export function InlineDownloadOrb({ liveActivity }) {
  if (!liveActivity?.active) return null;
  const hasPercent = typeof liveActivity.percent === 'number' && Number.isFinite(liveActivity.percent);
  const pct = liveActivity.done
    ? 100
    : hasPercent
    ? Math.max(0, Math.min(100, Math.round(liveActivity.percent)))
    : null;
  const isIndeterminate = pct == null && !liveActivity.done;
  const fillPct = liveActivity.done ? 100 : (pct ?? 44);
  const tooltipText = `${liveActivity.title || 'İndirme'} • ${
    liveActivity.done ? '%100' : pct != null ? `%${pct}` : `${liveActivity.downloadedMB ?? 0} MB`
  }`;

  return (
    <div
      className={`inline-download-wrap ${liveActivity.done ? 'is-done' : ''}`}
      title={tooltipText}
    >
      <span className="compact-dl-divider" aria-hidden="true" />
      <div className="download-droplet-orb">
        <div
          className={`download-droplet-liquid ${isIndeterminate ? 'is-indeterminate' : ''}`}
          style={{ height: `${fillPct}%` }}
          aria-hidden="true"
        >
          <svg
            className="download-droplet-wave"
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
          >
            <path d="M0 6 Q 12.5 1, 25 6 T 50 6 T 75 6 T 100 6 L 100 12 L 0 12 Z" />
          </svg>
        </div>

        <svg className="download-droplet-orbit" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="dlDropletOrbitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.98" />
            </linearGradient>
          </defs>
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="1.6"
          />
          <circle
            className="download-droplet-orbit-arc"
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke={liveActivity.done ? '#4ade80' : 'url(#dlDropletOrbitGrad)'}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray={liveActivity.done ? '62.83 0' : '22 41'}
          />
        </svg>

        <span className="download-droplet-icon" aria-hidden="true">
          {liveActivity.done ? (
            <Check size={10} strokeWidth={2.9} />
          ) : liveActivity.kind === 'steam' ? (
            <Gamepad2 size={10} strokeWidth={2.3} />
          ) : (
            <ArrowDown size={10} strokeWidth={2.7} />
          )}
        </span>
      </div>
    </div>
  );
}

export function HomeLiveAndContextStrip({ appContext, onOpenMirror }) {
  if (!appContext || appContext.category !== 'meeting') return null;

  return (
    <div className="home-context-strip">
      <span className="home-context-label">
        Toplantı Modu{appContext.app ? ` • ${appContext.app}` : ''}
      </span>
      <div className="home-context-actions">
        <button
          type="button"
          className="home-ctx-btn"
          onClick={onOpenMirror}
          title="Hızlı Ayna aç"
        >
          <Video size={12} />
          <span>Ayna</span>
        </button>
      </div>
    </div>
  );
}

