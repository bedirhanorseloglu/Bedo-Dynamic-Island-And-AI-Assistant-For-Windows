import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import RoboEyes from '../RoboEyes';

const STATE_META = {
  INITIALISING: { label: 'Hazırlanıyor', tone: 'listening' },
  LISTENING: { label: 'Dinliyor', tone: 'listening' },
  THINKING: { label: 'Düşünüyor...', tone: 'thinking' },
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
  webcamActive,
  webcamFrame,
  active = false,
  onToggleMute,
  onToggleWebcam,
  onClose,
}) {
  const paused = Boolean(status?.paused);
  const muted = Boolean(status?.muted);
  const jarvisState = status?.jarvisState || 'LISTENING';
  const meta = paused
    ? { label: 'Uyku', tone: 'sleeping' }
    : STATE_META[jarvisState] || STATE_META.LISTENING;

  const liveLine =
    jarvisState === 'SPEAKING' && reply
      ? reply
      : jarvisState === 'THINKING'
        ? thinkingHint
          ? thinkingHint
          : userTranscript
            ? `Siz: ${userTranscript}`
            : 'Yanıt hazırlanıyor...'
        : userTranscript
          ? `Siz: ${userTranscript}`
          : reply || 'Sizi dinliyorum...';

  return (
    <div className={`bedo-island-content tone-${meta.tone}`}>
      {/* Sol: Canlı Konuşan/Dinleyen/Düşünen Robo */}
      <div className="bedo-island-avatar">
        <span className="bedo-island-ring" aria-hidden="true" />
        <RoboEyes
          mood={paused ? 'sleepy' : roboMood}
          reaction={roboReaction}
          micLevel={micLevel}
          showMouth={true}
          size="small"
          trackCursor={false}
          active={active}
        />
      </div>

      {/* Orta: Durum + Anlık Akan Konuşma */}
      <div className="bedo-island-center">
        <div className="bedo-island-status-row">
          <span className="bedo-island-name">Bedo</span>
          <span className="bedo-island-sep">·</span>
          <span className="bedo-island-state">{meta.label}</span>
          {!paused && !muted && (
            <span className="bedo-island-eq" aria-hidden="true">
              {[0.1, 0.22, 0.4, 0.65].map((t, i) => (
                <i
                  key={i}
                  className={micLevel >= t ? 'is-lit' : ''}
                  style={{
                    height: `${Math.min(11, Math.max(3, Math.round(3 + micLevel * (6 + i * 2))))}px`,
                  }}
                />
              ))}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={liveLine}
            className="bedo-island-caption"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16 }}
            title={liveLine}
          >
            {liveLine}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sağ: Kamera Önizleme + Minimal Kontroller */}
      <div className="bedo-island-right">
        <AnimatePresence>
          {webcamActive && (
            <motion.div
              className="bedo-island-cam"
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 52 }}
              exit={{ opacity: 0, scale: 0.8, width: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              {webcamFrame ? (
                <img src={webcamFrame} alt="Kamera" decoding="async" />
              ) : (
                <span className="bedo-island-cam-dot" />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          className={`bedo-island-btn ${webcamActive ? 'is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWebcam();
          }}
          title={webcamActive ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
        >
          {webcamActive ? <Video size={12} /> : <VideoOff size={12} />}
        </button>

        <button
          type="button"
          className={`bedo-island-btn ${muted ? 'is-muted' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          title={muted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
        >
          {muted ? <MicOff size={12} /> : <Mic size={12} />}
        </button>

        <button
          type="button"
          className="bedo-island-btn is-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Kapat"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
