import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUp,
  Check,
  Copy,
  Mic,
  MicOff,
  Pause,
  Play,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import RoboEyes from '../RoboEyes';
import RoboMarkdown from '../RoboMarkdown';

const STATE_LABELS = {
  INITIALISING: 'Hazırlanıyor',
  LISTENING: 'Dinliyor',
  THINKING: 'Düşünüyor',
  SPEAKING: 'Konuşuyor',
  ERROR: 'Bağlantı Hatası',
};

const QUICK_PROMPTS = [
  'Şarkıyı devam ettir',
  'Bugün hava nasıl?',
  'Odak sayacını başlat',
];

const SPRING = { type: 'spring', stiffness: 400, damping: 32, mass: 0.85 };

export default function BedoStage({
  status,
  webcamFrame,
  micLevel = 0,
  roboMood,
  roboReaction,
  documentVisible,
  userTranscript,
  reply,
  loading,
  question,
  onQuestionChange,
  onSubmit,
  onToggleMute,
  onTogglePause,
  onToggleWebcam,
  onCopyReply,
  onClearReply,
  onPokeEyes,
}) {
  const paused = Boolean(status?.paused);
  const muted = Boolean(status?.muted);
  const webcamActive = Boolean(status?.webcamActive);
  const running = Boolean(status?.running);
  const jarvisState = status?.jarvisState || 'INITIALISING';
  const [copied, setCopied] = useState(false);

  const auraMode = paused
    ? 'sleeping'
    : jarvisState === 'SPEAKING'
      ? 'speaking'
      : jarvisState === 'THINKING' || loading
        ? 'thinking'
        : jarvisState === 'ERROR'
          ? 'error'
          : 'listening';

  const statusText = !running
    ? 'Çevrimdışı'
    : paused
      ? 'Uyku Modu'
      : STATE_LABELS[jarvisState] || jarvisState;

  const eyeMood = paused ? 'sleepy' : roboMood;

  const handleCopy = () => {
    onCopyReply?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleQuickPrompt = (text) => {
    onQuestionChange(text);
  };

  return (
    <motion.div
      className="bedo-v2-shell"
      data-aura={auraMode}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING}
    >
      {/* Sol Sütun: Canlı Apple Intelligence / Siri Orb */}
      <div className="bedo-v2-orb-col">
        <motion.button
          type="button"
          className={`bedo-v2-orb ${auraMode}`}
          onClick={onTogglePause}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          transition={SPRING}
          title={paused ? 'Bedo’yu Uyandır' : 'Uyku Moduna Al'}
          style={{ '--bedo-mic': Math.min(1, Math.max(0, micLevel)) }}
        >
          <span className="bedo-v2-orb-ring" aria-hidden="true" />
          <span className="bedo-v2-orb-core" aria-hidden="true" />
          <div className="bedo-v2-orb-face">
            <RoboEyes
              mood={eyeMood}
              size="medium"
              reaction={roboReaction}
              micLevel={micLevel}
              showMouth={true}
              active={documentVisible}
            />
          </div>
        </motion.button>

        <div className="bedo-v2-orb-meta">
          <span className={`bedo-v2-dot is-${auraMode}`} />
          <span className="bedo-v2-state-label">{statusText}</span>
        </div>

        {!paused && !muted && running && (
          <div className="bedo-v2-eq" aria-hidden="true">
            {[0.08, 0.18, 0.34, 0.52, 0.72].map((thresh, idx) => (
              <i
                key={idx}
                className={micLevel >= thresh ? 'is-lit' : ''}
                style={{
                  height: `${Math.min(14, Math.max(3, Math.round(3 + micLevel * (8 + (idx % 3) * 3))))}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sağ Sütun: Üst Kontroller + Sohbet/Kamera + Komut Çubuğu */}
      <div className="bedo-v2-main-col">
        <div className="bedo-v2-header">
          <div className="bedo-v2-title-group">
            <span className="bedo-v2-brand">Bedo</span>
            <span className="bedo-v2-sub">
              {paused ? '"Hey Bedo" de veya küreye dokun' : 'Sesli & yazılı asistan hazır'}
            </span>
          </div>

          <div className="bedo-v2-controls">
            {reply && !webcamActive && (
              <>
                <button
                  type="button"
                  className="bedo-v2-ctrl-btn"
                  onClick={handleCopy}
                  title="Yanıtı Kopyala"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
                <button
                  type="button"
                  className="bedo-v2-ctrl-btn"
                  onClick={onClearReply}
                  title="Temizle"
                >
                  <X size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              className={`bedo-v2-ctrl-btn ${webcamActive ? 'is-active' : ''}`}
              onClick={onToggleWebcam}
              title={webcamActive ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
            >
              {webcamActive ? <Video size={13} /> : <VideoOff size={13} />}
            </button>
            <button
              type="button"
              className={`bedo-v2-ctrl-btn ${muted ? 'is-danger' : !paused ? 'is-live' : ''}`}
              onClick={() => (paused ? onTogglePause() : onToggleMute())}
              title={paused ? 'Bedo’yu Uyandır' : muted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
            >
              {muted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            <button
              type="button"
              className={`bedo-v2-ctrl-btn ${!paused ? 'is-active' : ''}`}
              onClick={onTogglePause}
              title={paused ? 'Başlat' : 'Uyku Modu'}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
          </div>
        </div>

        {/* Orta Alan: Kamera VEYA Canlı Sohbet/Yanıt VEYA Hızlı Öneriler */}
        <div className="bedo-v2-body">
          <AnimatePresence mode="wait">
            {webcamActive ? (
              <motion.div
                key="v2-cam"
                className="bedo-v2-cam-wrap"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING}
              >
                {webcamFrame ? (
                  <img src={webcamFrame} alt="Kamera Önizleme" className="bedo-v2-cam-img" decoding="async" />
                ) : (
                  <div className="bedo-v2-cam-loading">Kamera başlatılıyor...</div>
                )}
                <span className="bedo-v2-cam-badge">CANLI</span>
              </motion.div>
            ) : reply || userTranscript || loading ? (
              <motion.div
                key="v2-feed"
                className="bedo-v2-feed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {userTranscript && (
                  <div className="bedo-v2-user-pill">
                    <span>Siz</span>
                    <p>{userTranscript}</p>
                  </div>
                )}
                <div className="bedo-v2-reply-scroll">
                  {reply ? (
                    <RoboMarkdown content={reply} />
                  ) : (
                    <div className="bedo-v2-thinking-line">
                      <span>Yanıt hazırlanıyor...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="v2-idle"
                className="bedo-v2-suggestions"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="bedo-v2-chip"
                    onClick={() => handleQuickPrompt(item)}
                  >
                    <span>{item}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Alt Komut Çubuğu */}
        <div className={`bedo-v2-input-bar ${loading ? 'is-thinking' : ''}`}>
          <input
            type="text"
            placeholder={loading ? 'Bedo yanıtlıyor...' : "Bedo'ya konuş veya yaz..."}
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && onSubmit()}
            aria-label="Bedo komutu"
          />
          <button
            type="button"
            className={`bedo-v2-send ${question.trim() && !loading ? 'is-ready' : ''}`}
            onClick={onSubmit}
            disabled={loading || !question.trim()}
            aria-label="Gönder"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
