import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Settings,
  Video,
  VideoOff,
  X,
  Scan,
} from 'lucide-react';
import RoboEyes from '../RoboEyes';
import RoboMarkdown from '../RoboMarkdown';

const STATE_LABELS = {
  tr: {
    INITIALISING: 'Hazırlanıyor',
    LISTENING: 'Dinliyor',
    THINKING: 'Düşünüyor',
    SPEAKING: 'Konuşuyor',
    ERROR: 'Bağlantı Hatası',
  },
  en: {
    INITIALISING: 'Initialising',
    LISTENING: 'Listening',
    THINKING: 'Thinking',
    SPEAKING: 'Speaking',
    ERROR: 'Connection Error',
  },
};

const EQ_WEIGHTS = [0.42, 0.72, 0.94, 1, 0.94, 0.72, 0.42];
const EQ_THRESHOLDS = [0.1, 0.2, 0.35, 0.5, 0.35, 0.2, 0.1];

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.82 };
const LAYOUT_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.88 };

const SETUP_PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    placeholderTr: 'Gemini API anahtarı (AIzaSy... / AQ....)',
    placeholderEn: 'Gemini API key (AIzaSy... / AQ....)',
    descTr: 'Tüm özellikler için Gemini API önerilir.',
    descEn: 'Gemini API is recommended for all features.',
    url: 'https://aistudio.google.com/apikey',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    placeholderTr: 'OpenAI API anahtarı (sk-...)',
    placeholderEn: 'OpenAI API key (sk-...)',
    descTr: 'GPT metin sohbeti. Ses için Gemini önerilir.',
    descEn: 'GPT text chat. Gemini recommended for voice.',
    url: 'https://platform.openai.com/api-keys',
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    placeholderTr: 'Anthropic API anahtarı (sk-ant-...)',
    placeholderEn: 'Anthropic API key (sk-ant-...)',
    descTr: 'Claude metin sohbeti. Ses için Gemini önerilir.',
    descEn: 'Claude text chat. Gemini recommended for voice.',
    url: 'https://console.anthropic.com/settings/keys',
  },
};

export default function BedoStage({
  status,
  systemMicMuted = false,
  webcamFrame,
  micLevel = 0,
  roboMood,
  roboReaction,
  outfit = 'Crown',
  seasonalOutfits = false,
  blinkingEnabled = true,
  documentVisible,
  userTranscript,
  reply,
  loading,
  question,
  hasApiKey = true,
  activeProvider = null,
  pythonBootstrapStatus = null,
  langCode = 'tr',
  onQuestionChange,
  onSubmit,
  onValidateApiKey,
  onSaveApiKey,
  onOpenApiKeyPage,
  onOpenSettings,
  onToggleMute,
  onTogglePause,
  onToggleWebcam,
  onStartBuddy,
  onCopyReply,
  onClearReply,
  onPokeEyes,
}) {
  const paused = Boolean(status?.paused);
  const muted = Boolean(status?.muted);
  const effectiveMicMuted = Boolean(systemMicMuted || muted);
  const webcamActive = Boolean(status?.webcamActive);
  const running = Boolean(status?.running);
  const jarvisState = status?.jarvisState || 'INITIALISING';
  const [copied, setCopied] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [wakeSeq, setWakeSeq] = useState(0);
  const [setupProvider, setSetupProvider] = useState('gemini');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showKeyPlain, setShowKeyPlain] = useState(false);
  const [activatingKey, setActivatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const prevPausedRef = useRef(paused);

  const needsApiKey = !hasApiKey && !running;
  const isTextOnlyMode = !running && (activeProvider === 'openai' || activeProvider === 'claude');

  const handleActivateApiKey = async (e) => {
    e?.preventDefault?.();
    const cleaned = apiKeyDraft.trim();
    if (!cleaned || activatingKey) return;
    setKeyError('');
    setActivatingKey(true);
    try {
      if (onValidateApiKey) {
        const res = await onValidateApiKey(setupProvider, cleaned);
        if (res && res.ok === false) {
          setKeyError(
            res.reason === 'network'
              ? (langCode === 'tr' ? 'Bağlantı kurulamadı. İnternetinizi kontrol edin.' : 'Connection failed. Check your internet.')
              : (langCode === 'tr' ? 'Geçersiz API anahtarı. Lütfen kontrol edin.' : 'Invalid API key. Please check and try again.')
          );
          setActivatingKey(false);
          return;
        }
      }
      await onSaveApiKey?.(setupProvider, cleaned);
      setApiKeyDraft('');
      setTimeout(() => setActivatingKey(false), 500);
    } catch {
      setKeyError(langCode === 'tr' ? 'Doğrulama başarısız oldu.' : 'Verification failed.');
      setActivatingKey(false);
    }
  };

  useEffect(() => {
    if (prevPausedRef.current && !paused) {
      setWakeSeq((s) => s + 1);
    }
    prevPausedRef.current = paused;
  }, [paused]);

  const isThinking = Boolean(loading || (!paused && running && jarvisState === 'THINKING'));
  const hasContent = Boolean(webcamActive || isThinking || reply || userTranscript || question.trim());
  const isTop = !paused || inputFocused || hasContent;

  const auraMode = paused
    ? 'sleeping'
    : jarvisState === 'SPEAKING'
      ? 'speaking'
      : isThinking
        ? 'thinking'
        : jarvisState === 'ERROR' || (!running && status?.lastError)
          ? 'error'
          : 'listening';

  const isBootstrappingVoice =
    !running &&
    activeProvider === 'gemini' &&
    (pythonBootstrapStatus?.state === 'downloading-python' ||
      pythonBootstrapStatus?.state === 'installing-deps');

  const localizedStates = STATE_LABELS[langCode === 'tr' ? 'tr' : 'en'];
  const statusText = !running
    ? isBootstrappingVoice
      ? (langCode === 'tr' ? 'Metin Hazır · Ses kuruluyor' : 'Text Ready · Setting up voice')
      : status?.lastError
        ? (langCode === 'tr' ? 'Ses Bağlantı Hatası' : 'Voice Connection Error')
        : activeProvider === 'gemini'
          ? (langCode === 'tr' ? 'Gemini · Metin Modu' : 'Gemini · Text Mode')
          : isTextOnlyMode
            ? activeProvider === 'openai'
              ? (langCode === 'tr' ? 'GPT · Metin Modu' : 'GPT · Text Mode')
              : (langCode === 'tr' ? 'Claude · Metin Modu' : 'Claude · Text Mode')
            : (langCode === 'tr' ? 'Çevrimdışı' : 'Offline')
    : paused
      ? (langCode === 'tr' ? 'Uyku Modu' : 'Sleep Mode')
      : localizedStates[jarvisState] || jarvisState;

  const eyeMood = paused ? 'sleepy' : roboMood;
  const clampedMic = Math.min(1, Math.max(0, micLevel));

  const handleCopy = () => {
    onCopyReply?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  if (needsApiKey) {
    const isTr = langCode === 'tr';
    const providerCfg = SETUP_PROVIDERS[setupProvider] || SETUP_PROVIDERS.gemini;
    const canSubmit = apiKeyDraft.trim().length >= 10 && !activatingKey;
    return (
      <motion.div
        key="bedo-api-setup"
        className="bedo-setup-screen"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={SPRING}
      >
        {/* Ambient breathing aurora */}
        <div className="bedo-setup-aurora" aria-hidden="true">
          <span className="bedo-setup-blob blob-a" />
          <span className="bedo-setup-blob blob-b" />
        </div>

        {/* Hero Row */}
        <div className="bedo-setup-hero">
          <motion.button
            type="button"
            className="bedo-setup-orb-wrap"
            onClick={onPokeEyes}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING}
            aria-label="Bedo"
          >
            <div className="bedo-setup-orb">
              <RoboEyes
                mood={roboMood === 'normal' ? 'happy' : roboMood}
                reaction={roboReaction || 'happy'}
                size="normal"
                trackCursor={true}
                showMouth={false}
                outfit={outfit}
                seasonalOutfits={seasonalOutfits}
                blinkingEnabled={blinkingEnabled}
                active={documentVisible}
              />
            </div>
          </motion.button>

          <div className="bedo-setup-copy">
            <div className="bedo-setup-head-row">
              <motion.h3
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.32 }}
              >
                {isTr ? 'Bedo’yu Etkinleştir' : 'Activate Bedo'}
              </motion.h3>

              <div className="bedo-setup-providers" role="tablist" aria-label="AI Provider">
                {Object.values(SETUP_PROVIDERS).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={setupProvider === p.id}
                    className={`bedo-setup-provider-btn ${setupProvider === p.id ? 'active' : ''}`}
                    onClick={() => {
                      setSetupProvider(p.id);
                      setApiKeyDraft('');
                      setKeyError('');
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <motion.p
              key={keyError || setupProvider}
              className={keyError ? 'bedo-setup-error' : ''}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {keyError || (isTr ? providerCfg.descTr : providerCfg.descEn)}
            </motion.p>
          </div>
        </div>

        {/* Bottom Interactive Action Dock */}
        <motion.form
          className="bedo-setup-dock"
          onSubmit={handleActivateApiKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={`bedo-setup-input-wrap ${keyError ? 'is-error' : ''}`}>
            <input
              type={showKeyPlain ? 'text' : 'password'}
              value={apiKeyDraft}
              onChange={(e) => {
                setApiKeyDraft(e.target.value);
                if (keyError) setKeyError('');
              }}
              placeholder={isTr ? providerCfg.placeholderTr : providerCfg.placeholderEn}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${providerCfg.label} API Key`}
            />
            {apiKeyDraft && (
              <button
                type="button"
                className="bedo-setup-eye-btn"
                onClick={() => setShowKeyPlain((v) => !v)}
                aria-label={showKeyPlain ? 'Gizle' : 'Göster'}
              >
                {showKeyPlain ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
            <button
              type="submit"
              className={`bedo-setup-submit ${canSubmit ? 'is-ready' : ''}`}
              disabled={!canSubmit}
            >
              {activatingKey ? (
                <span>{isTr ? 'Kontrol...' : 'Checking...'}</span>
              ) : (
                <>
                  <span>{isTr ? 'Başlat' : 'Start'}</span>
                  <ArrowRight size={12} strokeWidth={2.4} />
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            className="bedo-setup-link-btn"
            onClick={() => onOpenApiKeyPage?.(providerCfg.url)}
            title={providerCfg.url}
          >
            <span>{isTr ? 'Anahtar Al' : 'Get Key'}</span>
            <ExternalLink size={11} strokeWidth={2.2} />
          </button>

          <button
            type="button"
            className="bedo-setup-icon-btn"
            onClick={onOpenSettings}
            title={isTr ? 'Ayarlar' : 'Settings'}
            aria-label={isTr ? 'Ayarlar' : 'Settings'}
          >
            <Settings size={13} strokeWidth={2} />
          </button>
        </motion.form>
      </motion.div>
    );
  }

  return (
    <LayoutGroup id="bedo-stage-layout">
      <motion.div
        className={`bedo-v2-shell ${isTop ? 'is-top' : 'is-centered'} ${webcamActive ? 'has-cam' : ''}`}
        data-aura={auraMode}
        initial={{ opacity: 0, scale: 0.98, y: -2 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
      >
        {/* Sol Kamera Alanı (Sadece kamera açıkken animasyonla solda açılır) */}
        <AnimatePresence>
          {webcamActive && (
            <motion.div
              key="v2-cam-left"
              className="bedo-v2-cam-panel"
              initial={{ opacity: 0, x: -18, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -18, scale: 0.95 }}
              transition={LAYOUT_SPRING}
            >
              <div className="bedo-v2-cam-frame">
                {webcamFrame ? (
                  <img src={webcamFrame} alt="Kamera Önizleme" className="bedo-v2-cam-img" decoding="async" />
                ) : (
                  <div className="bedo-v2-cam-loading">Kamera başlatılıyor...</div>
                )}
                <span className="bedo-v2-cam-vignette" aria-hidden="true" />
                <span className="bedo-v2-cam-badge">
                  <i aria-hidden="true" />
                  CANLI
                </span>
                <button
                  type="button"
                  className="bedo-v2-cam-close"
                  onClick={onToggleWebcam}
                  aria-label="Kamerayı Kapat"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ana Sahne (Merkezde küre + alt input; aktifken üstte Bedo şeridi + orta sohbet + alt input) */}
        <div className="bedo-v2-stage-main">
          {/* Üst Satır: Küre + Durum + Sağ Kontroller */}
          <div className={`bedo-v2-top-row ${isTop ? 'is-top' : 'is-centered'}`}>
            {/* Bedo Küre + Durum (Uyurken ortada, uyanınca/yazınca üstte) */}
            <motion.div
              layout
              transition={LAYOUT_SPRING}
              className={`bedo-v2-orb-bar ${isTop ? 'is-top' : 'is-centered'}`}
            >
              <motion.div layout transition={LAYOUT_SPRING} className={`bedo-v2-orb-stage ${isTop ? 'is-top' : ''}`}>
                <motion.button
                  type="button"
                  layout
                  className={`bedo-v2-orb ${auraMode} ${isTop ? 'is-top' : ''}`}
                  onClick={onTogglePause}
                  animate={
                    wakeSeq > 0 && !paused && auraMode === 'listening'
                      ? { scale: [0.9, 1.08, 0.98, 1] }
                      : auraMode === 'speaking'
                        ? { scale: [1, 1.035, 1] }
                        : auraMode === 'thinking'
                          ? { scale: [1, 1.022, 1] }
                          : { scale: 1 }
                  }
                  transition={
                    auraMode === 'speaking' || auraMode === 'thinking'
                      ? { repeat: Infinity, duration: auraMode === 'speaking' ? 1.15 : 1.65, ease: 'easeInOut' }
                      : wakeSeq > 0 && !paused
                        ? { duration: 0.56, ease: [0.22, 1, 0.36, 1] }
                        : LAYOUT_SPRING
                  }
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.93 }}
                  aria-label={paused ? 'Bedo’yu Uyandır' : 'Uyku Moduna Al'}
                  style={{ '--bedo-mic': clampedMic }}
                >
                  <div className="bedo-v2-orb-face">
                    <RoboEyes
                      mood={eyeMood}
                      size={isTop ? 'small' : 'large'}
                      reaction={roboReaction}
                      micLevel={micLevel}
                      showMouth={false}
                      outfit={outfit}
                      seasonalOutfits={seasonalOutfits}
                      blinkingEnabled={blinkingEnabled}
                      active={documentVisible}
                    />
                  </div>
                </motion.button>
              </motion.div>

              <motion.div layout="position" transition={LAYOUT_SPRING} className={`bedo-v2-orb-info ${isTop ? 'is-top' : ''}`}>
                {isTop && (
                  <div className="bedo-v2-title-group">
                    <span className="bedo-v2-brand">Bedo</span>
                  </div>
                )}
                <div className={`bedo-v2-status-row ${isTop ? 'is-top' : ''}`}>
                  {auraMode !== 'sleeping' && (
                    <div className={`bedo-v2-orb-meta is-${auraMode}`}>
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={statusText}
                          className="bedo-v2-state-label"
                          initial={{ opacity: 0, y: 4, filter: 'blur(3px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: -4, filter: 'blur(3px)' }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {statusText}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  )}
                  {isTop && !webcamActive && (
                    <div
                      className={`bedo-v2-eq is-${auraMode} ${!paused && !muted && running ? 'is-active' : 'is-idle'}`}
                      aria-hidden="true"
                    >
                      {EQ_WEIGHTS.map((weight, idx) => {
                        const active = !paused && !muted && running;
                        const lit = active && clampedMic >= EQ_THRESHOLDS[idx];
                        const barHeight = active
                          ? Math.min(11, Math.max(3, Math.round(3 + clampedMic * 8 * weight)))
                          : 3;
                        return (
                          <i
                            key={idx}
                            className={lit ? 'is-lit' : ''}
                            style={{ height: `${barHeight}px` }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>

            {/* Sağ Üst Kontroller (Üst modda flex hizalı, merkez modda sağ üstte) */}
            <div className={`bedo-v2-controls-anchor ${isTop ? 'is-top' : 'is-centered'}`}>
              <div className="bedo-v2-controls">
                {reply && !webcamActive && (
                  <>
                    <button
                      type="button"
                      className="bedo-v2-ctrl-btn"
                      onClick={handleCopy}
                      aria-label="Yanıtı Kopyala"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button
                      type="button"
                      className="bedo-v2-ctrl-btn"
                      onClick={onClearReply}
                      aria-label="Temizle"
                    >
                      <X size={13} />
                    </button>
                    <span className="bedo-v2-ctrl-divider" aria-hidden="true" />
                  </>
                )}
                <button
                  type="button"
                  className="bedo-v2-ctrl-btn"
                  onClick={onStartBuddy}
                  title="Bedo Buddy — Ekrandan Sor"
                  aria-label="Bedo Buddy — Ekrandan Sor"
                >
                  <Scan size={13} />
                </button>
                <button
                  type="button"
                  className={`bedo-v2-ctrl-btn ${webcamActive ? 'is-active' : ''}`}
                  onClick={onToggleWebcam}
                  aria-label={webcamActive ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
                >
                  {webcamActive ? <Video size={13} /> : <VideoOff size={13} />}
                </button>
                <button
                  type="button"
                  className={`bedo-v2-ctrl-btn ${effectiveMicMuted ? 'is-danger' : !paused ? 'is-live' : ''}`}
                  onClick={() => {
                    if (systemMicMuted || muted) {
                      onToggleMute?.();
                      if (paused) onTogglePause?.();
                    } else if (paused) {
                      onTogglePause?.();
                    } else {
                      onToggleMute?.();
                    }
                  }}
                  aria-label={
                    systemMicMuted
                      ? 'Sistem Mikrofonunu Aç'
                      : paused
                        ? 'Bedo’yu Uyandır'
                        : muted
                          ? 'Mikrofonu Aç'
                          : 'Mikrofonu Sustur'
                  }
                >
                  {effectiveMicMuted ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
                <button
                  type="button"
                  className={`bedo-v2-ctrl-btn ${!paused ? 'is-active' : ''}`}
                  onClick={onTogglePause}
                  aria-label={paused ? 'Başlat' : 'Uyku Modu'}
                >
                  {paused ? <Play size={12} /> : <Pause size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Orta Alan: Canlı Sohbet / Yanıt (Üst modda görünür) */}
          <AnimatePresence>
            {isTop && (reply || userTranscript || isThinking) && (
              <motion.div
                key="v2-feed"
                className="bedo-v2-feed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {userTranscript && (
                  <div className="bedo-v2-user-pill">
                    <span>{langCode === 'tr' ? 'Siz' : 'You'}</span>
                    <p>{userTranscript}</p>
                  </div>
                )}
                {(reply || isThinking) && (
                  <div className="bedo-v2-reply-scroll">
                    {reply ? (
                      <RoboMarkdown content={reply} />
                    ) : (
                      <div className="bedo-v2-thinking-line">
                        <span className="bedo-v2-thinking-dots" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span>{langCode === 'tr' ? 'Yanıt hazırlanıyor...' : 'Preparing response...'}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alt Komut Çubuğu */}
          <motion.div
            layout
            transition={LAYOUT_SPRING}
            className={`bedo-v2-input-bar ${loading || jarvisState === 'THINKING' ? 'is-thinking' : ''} ${isTop ? 'is-top' : 'is-centered'}`}
          >
            <input
              type="text"
              placeholder={
                loading
                  ? (langCode === 'tr' ? 'Bedo yanıtlıyor...' : 'Bedo is replying...')
                  : isTextOnlyMode
                    ? activeProvider === 'openai'
                      ? (langCode === 'tr' ? "GPT'ye yaz..." : 'Ask GPT...')
                      : (langCode === 'tr' ? "Claude'a yaz..." : 'Ask Claude...')
                    : (langCode === 'tr' ? "Bedo'ya konuş veya yaz..." : 'Talk or type to Bedo...')
              }
              value={question}
              onFocus={() => {
                setInputFocused(true);
                if (paused) onTogglePause?.();
              }}
              onBlur={() => setInputFocused(false)}
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
          </motion.div>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
