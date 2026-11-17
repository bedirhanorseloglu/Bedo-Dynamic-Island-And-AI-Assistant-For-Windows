import React from 'react';
import { MicOff, X } from 'lucide-react';
import RoboEyes from '../RoboEyes';

const STATE_META = {
  INITIALISING: { label: 'Hazırlanıyor', tone: 'listening' },
  LISTENING: { label: 'Dinliyor', tone: 'listening' },
  THINKING: { label: 'Düşünüyor', tone: 'thinking' },
  SPEAKING: { label: 'Konuşuyor', tone: 'speaking' },
  ERROR: { label: 'Hata', tone: 'error' },
};

export default function BedoIslandOverlay({
  status,
  micLevel = 0,
  roboMood,
  roboReaction,
  userTranscript,
  reply,
  thinkingHint = '',
  active = false,
  onOpenMain,
  onClose,
}) {
  const paused = Boolean(status?.paused);
  const muted = Boolean(status?.muted);
  const jarvisState = status?.jarvisState || 'LISTENING';
  const meta = paused
    ? { label: 'Uyku', tone: 'sleeping' }
    : STATE_META[jarvisState] || STATE_META.LISTENING;

  const tooltip =
    jarvisState === 'SPEAKING' && reply
      ? reply
      : jarvisState === 'THINKING'
        ? thinkingHint || (userTranscript ? `Siz: ${userTranscript}` : 'Yanıt hazırlanıyor...')
        : userTranscript
          ? `Siz: ${userTranscript}`
          : reply || meta.label;

  return (
    <div
      className={`bedo-island-content is-inline-pill tone-${meta.tone}`}
      title={tooltip}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onOpenMain?.();
      }}
    >
      <div className="bedo-inline-left">
        <span className="bedo-inline-lens">
          <RoboEyes
            mood={paused ? 'sleepy' : roboMood}
            reaction={roboReaction}
            micLevel={micLevel}
            showMouth={true}
            size="mini"
            trackCursor={false}
            active={active}
          />
        </span>
      </div>

      <div className="bedo-inline-center">
        <span className="bedo-inline-state-dot" aria-hidden="true" />
        <span className="bedo-inline-label">{meta.label}</span>
      </div>

      <div className="bedo-inline-right">
        {!paused && !muted ? (
          <span className="bedo-island-eq is-apple-bars" aria-hidden="true">
            {[0.08, 0.2, 0.36, 0.55, 0.72].map((t, i) => (
              <i
                key={i}
                className={micLevel >= t ? 'is-lit' : ''}
                style={{
                  height: `${Math.min(13, Math.max(3, Math.round(3 + micLevel * (8 + (i % 2) * 3))))}px`,
                }}
              />
            ))}
          </span>
        ) : (
          <MicOff size={11} style={{ opacity: 0.6 }} />
        )}
        <button
          type="button"
          className="bedo-inline-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          title="Uyku Moduna Al"
          aria-label="Kapat"
        >
          <X size={10} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
