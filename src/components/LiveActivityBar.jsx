import React from 'react';
import { ArrowDown, Check, Gamepad2, Video } from 'lucide-react';
import { useI18n } from '../i18n';

function useAnimatedPercent(targetPct) {
  const [displayPct, setDisplayPct] = React.useState(targetPct);
  const currentRef = React.useRef(targetPct);

  React.useEffect(() => {
    if (targetPct == null) {
      currentRef.current = null;
      setDisplayPct(null);
      return;
    }
    const startVal = currentRef.current ?? targetPct;
    if (startVal === targetPct) {
      setDisplayPct(targetPct);
      return;
    }
    const duration = 360;
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = Math.round(startVal + (targetPct - startVal) * eased);
      currentRef.current = nextVal;
      setDisplayPct(nextVal);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [targetPct]);

  return displayPct;
}

export function IdleLiveActivityPill({ liveActivity }) {
  const { lang } = useI18n();
  const hasPercent = typeof liveActivity?.percent === 'number' && Number.isFinite(liveActivity.percent);
  const pct = liveActivity?.done ? 100 : hasPercent ? Math.max(0, Math.min(100, Math.round(liveActivity.percent))) : null;
  const displayPct = useAnimatedPercent(pct);

  if (!liveActivity?.active) return null;
  const isIndeterminate = pct == null && !liveActivity.done;
  const pctWidth = liveActivity.done ? 100 : (pct ?? 42);
  const fmtPct = (v) => (lang === 'tr' ? `%${v}` : `${v}%`);

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
          ? fmtPct(100)
          : displayPct != null
          ? fmtPct(displayPct)
          : '%'}
      </span>
    </div>
  );
}

export function InlineDownloadOrb({ liveActivity }) {
  const { t, lang } = useI18n();
  const hasPercent = typeof liveActivity?.percent === 'number' && Number.isFinite(liveActivity.percent);
  const pct = liveActivity?.done
    ? 100
    : hasPercent
    ? Math.max(0, Math.min(100, Math.round(liveActivity.percent)))
    : null;
  const displayPct = useAnimatedPercent(pct);

  if (!liveActivity?.active) return null;
  const isIndeterminate = pct == null && !liveActivity.done;
  const fillPct = liveActivity.done ? 100 : (pct ?? 44);
  const fmtPct = (v) => (lang === 'tr' ? `%${v}` : `${v}%`);
  const tooltipText = `${liveActivity.title || t('live.downloadFallback')} • ${
    liveActivity.done ? fmtPct(100) : pct != null ? fmtPct(pct) : `${liveActivity.downloadedMB ?? 0} MB`
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

        <span className="download-droplet-icon" aria-hidden="true">
          {liveActivity.done ? (
            <Check size={11} strokeWidth={2.9} />
          ) : liveActivity.kind === 'steam' ? (
            <Gamepad2 size={11} strokeWidth={2.3} />
          ) : (
            <span className="download-droplet-pct-text mono">
              {displayPct != null ? fmtPct(displayPct) : '%'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function HomeLiveAndContextStrip({ appContext, onOpenMirror }) {
  const { t } = useI18n();
  if (!appContext || appContext.category !== 'meeting') return null;

  return (
    <div className="home-context-strip">
      <span className="home-context-label">
        {t('live.meetingMode')}{appContext.app ? ` • ${appContext.app}` : ''}
      </span>
      <div className="home-context-actions">
        <button
          type="button"
          className="home-ctx-btn"
          onClick={onOpenMirror}
          title={t('live.openMirrorTitle')}
        >
          <Video size={12} />
          <span>{t('live.mirror')}</span>
        </button>
      </div>
    </div>
  );
}

