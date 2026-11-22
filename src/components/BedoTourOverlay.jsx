import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BellOff,
  Mic,
  MousePointer2,
  Timer,
  UploadCloud,
  X,
} from 'lucide-react';
import RoboEyes from '../RoboEyes';
import { playRoboSound } from '../sounds';

const EYE_DEMO_STATES = [
  {
    id: 'normal',
    color: '#ffffff',
    glow: 'rgba(255, 255, 255, 0.22)',
    labelTr: 'Hazır',
    labelEn: 'Ready',
    detailTr: 'Beklemede',
    detailEn: 'Standing by',
  },
  {
    id: 'charging',
    color: '#49e39a',
    glow: 'rgba(73, 227, 154, 0.34)',
    labelTr: 'Şarj Oluyor',
    labelEn: 'Charging',
    detailTr: 'Güce bağlı',
    detailEn: 'Connected to power',
  },
  {
    id: 'low-battery',
    color: '#ff4d5e',
    glow: 'rgba(255, 77, 94, 0.36)',
    labelTr: 'Düşük Pil',
    labelEn: 'Low Battery',
    detailTr: '%20 ve altı',
    detailEn: '20% or below',
  },
  {
    id: 'unread',
    color: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.34)',
    labelTr: 'Bildirim',
    labelEn: 'Notification',
    detailTr: 'Sağ göz kırpar',
    detailEn: 'Right-eye wink',
  },
  {
    id: 'agenda',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.34)',
    labelTr: 'Ajanda',
    labelEn: 'Agenda',
    detailTr: 'Sıradaki etkinlik',
    detailEn: 'Up next',
  },
];

const TOUR_SCENES = [
  {
    id: 'presence',
    mood: 'happy',
    look: { x: 0, y: 0 },
    aura: 'rgba(148, 163, 184, 0.2)',
    titleTr: 'Yaklaş, açılsın.',
    titleEn: 'Right at the top.',
    descTr: 'İhtiyacın olduğunda genişler. İşin bittiğinde sessizce toplanır.',
    descEn: 'Expands when you need it. Fades back when you don’t.',
  },
  {
    id: 'right-click',
    mood: 'normal',
    look: { x: 0, y: -2.6 },
    aura: 'rgba(56, 189, 248, 0.22)',
    titleTr: 'Tek sağ tıkla incelir.',
    titleEn: 'Slim down in one click.',
    descTr: 'Tam odaklanmak istediğinde ince bir çizgiye dönüşür. Tekrar sağ tıkla geri gelsin.',
    descEn: 'Right-click to tuck into a minimal bar. Right-click again to return.',
  },
  {
    id: 'eye-colors',
    mood: 'normal',
    look: { x: 0, y: 0 },
    aura: 'rgba(255, 255, 255, 0.2)',
    titleTr: 'Her rengin bir anlamı var.',
    titleEn: 'Every color speaks.',
    descTr: 'Tek bir bakış, durumu anlatmaya yeter.',
    descEn: 'One glance tells you everything.',
  },
  {
    id: 'dnd-tip',
    mood: 'normal',
    look: { x: 3.4, y: 2.2 },
    aura: 'rgba(251, 191, 36, 0.2)',
    titleTr: 'Tek yerden, daha temiz.',
    titleEn: 'One place. Zero clutter.',
    descTr: 'Sağ alttan Windows’u Rahatsız Etme moduna al. Bildirimler sadece Bedo’da görünsün.',
    descEn: 'Enable Windows Do Not Disturb from the bottom-right so alerts shine only in Bedo.',
  },
  {
    id: 'ai-and-secret',
    mood: 'inlove',
    look: { x: 0, y: 2.8 },
    aura: 'rgba(244, 114, 182, 0.22)',
    titleTr: 'Yaz, konuş, paylaş.',
    titleEn: 'Type, speak, share.',
    descTr: 'Bedo her an yanında. Küçük bir sır: Gözlerine 4 kez dokun.',
    descEn: 'Always ready to help. One secret: tap the eyes four times.',
  },
];

export default function BedoTourOverlay({
  open = false,
  langCode = 'tr',
  soundEffects = true,
  outfit = 'None',
  seasonalOutfits = false,
  step: controlledStep,
  onStepChange,
  onComplete,
  onSkip,
}) {
  const [internalStep, setInternalStep] = useState(0);
  const [eyeDemoIdx, setEyeDemoIdx] = useState(0);
  const [eyeAutoCycle, setEyeAutoCycle] = useState(true);
  const [presenceLook, setPresenceLook] = useState({ x: 0, y: 0 });
  const [morphPhase, setMorphPhase] = useState('expanded'); // 'pill' | 'expanded' | 'mini'
  const [pokeFeedback, setPokeFeedback] = useState(0);

  const isControlled = typeof controlledStep === 'number';
  const currentStep = isControlled ? controlledStep : internalStep;
  const scene = TOUR_SCENES[currentStep] || TOUR_SCENES[0];
  const isTr = langCode === 'tr';

  const setStep = (next) => {
    const clamped = Math.max(0, Math.min(TOUR_SCENES.length - 1, next));
    if (!isControlled) setInternalStep(clamped);
    onStepChange?.(clamped);
  };

  useEffect(() => {
    if (!open) {
      setInternalStep(0);
      setEyeDemoIdx(0);
      setEyeAutoCycle(true);
      setPokeFeedback(0);
      return;
    }
    playRoboSound('happy', soundEffects);
  }, [open]);

  // Scene 1: cursor-glide + pill-to-island breathing loop
  useEffect(() => {
    if (!open || scene.id !== 'presence') return undefined;
    const timers = [];
    const schedule = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    };
    setMorphPhase('pill');
    setPresenceLook({ x: -3.2, y: 0 });
    schedule(() => {
      setMorphPhase('expanded');
      setPresenceLook({ x: 3.0, y: 0 });
    }, 650);
    schedule(() => setPresenceLook({ x: 0, y: 0 }), 1250);
    const loop = setInterval(() => {
      setMorphPhase('pill');
      setPresenceLook({ x: -2.4, y: 0 });
      schedule(() => {
        setMorphPhase('expanded');
        setPresenceLook({ x: 0, y: 0 });
      }, 950);
    }, 3400);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, [open, scene.id]);

  // Scene 2: right-click -> shrink to slim mini bar -> restore loop
  useEffect(() => {
    if (!open || scene.id !== 'right-click') return undefined;
    const timers = [];
    const schedule = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    };
    setMorphPhase('expanded');
    const runCycle = () => {
      setMorphPhase('expanded');
      schedule(() => setMorphPhase('mini'), 1100);
      schedule(() => setMorphPhase('expanded'), 2600);
    };
    schedule(runCycle, 250);
    const loop = setInterval(runCycle, 3800);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, [open, scene.id]);

  // Scene 3: smooth 1-by-1 eye color showcase
  useEffect(() => {
    if (!open || scene.id !== 'eye-colors') return undefined;
    setEyeAutoCycle(true);
    return undefined;
  }, [open, scene.id]);

  useEffect(() => {
    if (!open || scene.id !== 'eye-colors' || !eyeAutoCycle) return undefined;
    const id = setInterval(() => {
      setEyeDemoIdx((prev) => (prev + 1) % EYE_DEMO_STATES.length);
    }, 1850);
    return () => clearInterval(id);
  }, [open, scene.id, eyeAutoCycle]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip?.();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (currentStep >= TOUR_SCENES.length - 1) {
          playRoboSound('happy', soundEffects);
          onComplete?.();
        } else {
          playRoboSound('tap', soundEffects);
          setStep(currentStep + 1);
        }
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        e.preventDefault();
        playRoboSound('tap', soundEffects);
        setStep(currentStep - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, currentStep, soundEffects]);

  if (!open) return null;

  const activeEyeDemo = scene.id === 'eye-colors' ? EYE_DEMO_STATES[eyeDemoIdx] : null;
  const activeLook = scene.id === 'presence' ? presenceLook : scene.look;
  const activeAura = activeEyeDemo ? activeEyeDemo.glow : scene.aura;

  return (
    <motion.div
      className="bedo-tour-card"
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      role="dialog"
      aria-label={isTr ? 'Bedo Tanıtım Turu' : 'Bedo Walkthrough'}
    >
      {/* Ambient radial glow matching Bedo's active mood/color */}
      <div
        className="bedo-tour-aura"
        style={{ background: `radial-gradient(circle at 50% 34%, ${activeAura}, transparent 68%)` }}
        aria-hidden="true"
      />

      {/* Minimal Apple-style top bar */}
      <div className="bedo-tour-header">
        <span className="bedo-tour-step-badge">
          {currentStep + 1} / {TOUR_SCENES.length}
        </span>
        <div className="bedo-tour-pips">
          {TOUR_SCENES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={`bedo-tour-pip ${idx === currentStep ? 'is-active' : idx < currentStep ? 'is-done' : ''}`}
              onClick={() => {
                playRoboSound('tap', soundEffects);
                setStep(idx);
              }}
              aria-label={isTr ? s.titleTr : s.titleEn}
            />
          ))}
        </div>
        <button
          type="button"
          className="bedo-tour-skip"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            playRoboSound('tap', soundEffects);
            onSkip?.();
          }}
          title={isTr ? 'Turu Kapat' : 'Close Tour'}
          aria-label={isTr ? 'Turu Kapat' : 'Close Tour'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Hero Stage: Floating RoboEyes + Fluid Micro-Demo */}
      <div className="bedo-tour-hero">
        <div className="bedo-tour-eyes-box">
          <RoboEyes
            mood={scene.mood}
            active={true}
            trackCursor={false}
            forcedLook={activeLook}
            demoEyeState={activeEyeDemo?.id || null}
            outfit={outfit}
            seasonalOutfits={seasonalOutfits}
            size="large"
            onPoke={() => setPokeFeedback((c) => c + 1)}
          />
        </div>

        <div className="bedo-tour-visual-slot">
          <AnimatePresence mode="wait">
            {scene.id === 'presence' && (
              <motion.div
                key="vis-presence"
                className="bedo-tour-morph-demo"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <motion.div
                  className="bedo-tour-island-sim"
                  animate={{
                    width: morphPhase === 'expanded' ? 176 : 86,
                    height: morphPhase === 'expanded' ? 36 : 22,
                    borderRadius: morphPhase === 'expanded' ? 14 : 999,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                >
                  <span className="bedo-tour-sim-dots">
                    <i />
                    <i />
                  </span>
                  {morphPhase === 'expanded' && (
                    <motion.span
                      className="bedo-tour-sim-text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {isTr ? 'Açıldı' : 'Expanded'}
                    </motion.span>
                  )}
                </motion.div>
                <motion.div
                  className="bedo-tour-pointer"
                  animate={{
                    x: morphPhase === 'expanded' ? 0 : 48,
                    y: morphPhase === 'expanded' ? 6 : 20,
                    opacity: morphPhase === 'expanded' ? 1 : 0.45,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                >
                  <MousePointer2 size={15} />
                </motion.div>
              </motion.div>
            )}

            {scene.id === 'right-click' && (
              <motion.div
                key="vis-right-click"
                className="bedo-tour-morph-demo"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <div className="bedo-tour-sim-stage">
                  <motion.div
                    className="bedo-tour-island-sim is-mini-capable"
                    animate={{
                      width: morphPhase === 'mini' ? 92 : 168,
                      height: morphPhase === 'mini' ? 10 : 32,
                      borderRadius: 999,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {morphPhase !== 'mini' ? (
                      <span className="bedo-tour-sim-text">
                        {isTr ? 'Normal Ada' : 'Full Island'}
                      </span>
                    ) : (
                      <span className="bedo-tour-sim-slimline" />
                    )}
                  </motion.div>

                  <motion.div
                    className="bedo-tour-pointer is-rightclick"
                    animate={{
                      x: morphPhase === 'mini' ? -4 : 10,
                      y: morphPhase === 'mini' ? 2 : 10,
                      scale: morphPhase === 'mini' ? 0.9 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  >
                    <motion.div
                      className="bedo-tour-click-ring"
                      animate={{
                        scale: morphPhase === 'mini' ? [0.5, 1.8] : 0.5,
                        opacity: morphPhase === 'mini' ? [0.9, 0] : 0,
                      }}
                      transition={{ duration: 0.55 }}
                    />
                    <svg width="20" height="26" viewBox="0 0 20 26" fill="none" aria-hidden="true">
                      <rect x="1.5" y="1.5" width="17" height="23" rx="8.5" fill="#0b0f19" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
                      <line x1="10" y1="2" x2="10" y2="11.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
                      <line x1="2" y1="11.5" x2="18" y2="11.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
                      <path
                        d="M10.6 2.2H11.5C15.1 2.2 17.8 4.9 17.8 8.5V10.9H10.6V2.2Z"
                        fill={morphPhase === 'mini' ? '#38bdf8' : 'rgba(56, 189, 248, 0.35)'}
                      />
                    </svg>
                  </motion.div>
                </div>

                <span className="bedo-tour-gesture-pill">
                  {isTr ? 'Sağ Tık' : 'Right Click'}
                </span>
              </motion.div>
            )}

            {scene.id === 'eye-colors' && activeEyeDemo && (
              <motion.div
                key="vis-eye-colors"
                className="bedo-tour-spotlight-legend"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeEyeDemo.id}
                    className="bedo-tour-active-status-pill"
                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span
                      className="bedo-tour-color-dot"
                      style={{
                        backgroundColor: activeEyeDemo.color,
                        boxShadow: `0 0 10px ${activeEyeDemo.color}`,
                      }}
                    />
                    <strong>{isTr ? activeEyeDemo.labelTr : activeEyeDemo.labelEn}</strong>
                    <span className="bedo-tour-sep">·</span>
                    <span className="bedo-tour-detail-txt">
                      {isTr ? activeEyeDemo.detailTr : activeEyeDemo.detailEn}
                    </span>
                  </motion.div>
                </AnimatePresence>

                <div className="bedo-tour-color-dots-nav">
                  {EYE_DEMO_STATES.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`bedo-tour-color-swatch ${idx === eyeDemoIdx ? 'is-active' : ''}`}
                      onClick={() => {
                        setEyeAutoCycle(false);
                        setEyeDemoIdx(idx);
                        playRoboSound('tap', soundEffects);
                      }}
                      title={isTr ? item.labelTr : item.labelEn}
                      aria-label={isTr ? item.labelTr : item.labelEn}
                    >
                      <span style={{ backgroundColor: item.color }} />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {scene.id === 'dnd-tip' && (
              <motion.div
                key="vis-dnd-tip"
                className="bedo-tour-feature-pills"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <span className="bedo-tour-feat-pill is-highlight">
                  <BellOff size={12} />
                  <span>
                    {isTr ? 'Sağ Alt → Windows Rahatsız Etme' : 'Bottom-Right → Windows DND'}
                  </span>
                </span>
              </motion.div>
            )}

            {scene.id === 'ai-and-secret' && (
              <motion.div
                key="vis-ai-secret"
                className="bedo-tour-feature-pills"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <span className="bedo-tour-feat-pill">
                  <Mic size={12} />
                  <span>{isTr ? 'Sesli Asistan' : 'Voice AI'}</span>
                </span>
                <span className="bedo-tour-feat-pill">
                  <UploadCloud size={12} />
                  <span>DropShare</span>
                </span>
                <span className="bedo-tour-feat-pill">
                  <Timer size={12} />
                  <span>{isTr ? 'Odak' : 'Focus'}</span>
                </span>
                {pokeFeedback > 0 && (
                  <span className="bedo-tour-feat-pill is-highlight">
                    {pokeFeedback >= 4
                      ? isTr ? 'Başım döndü!' : 'Whoa, dizzy!'
                      : `${pokeFeedback}/4`}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Apple-clean typography */}
      <AnimatePresence mode="wait">
        <motion.div
          key={scene.id}
          className="bedo-tour-copy"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18 }}
        >
          <h3>{isTr ? scene.titleTr : scene.titleEn}</h3>
          <p>{isTr ? scene.descTr : scene.descEn}</p>
        </motion.div>
      </AnimatePresence>

      {/* Sleek footer */}
      <div className="bedo-tour-footer">
        <button
          type="button"
          className="bedo-tour-btn ghost"
          disabled={currentStep === 0}
          onClick={() => {
            playRoboSound('tap', soundEffects);
            setStep(currentStep - 1);
          }}
        >
          <ArrowLeft size={14} />
          <span>{isTr ? 'Geri' : 'Back'}</span>
        </button>

        {currentStep < TOUR_SCENES.length - 1 ? (
          <button
            type="button"
            className="bedo-tour-btn primary"
            onClick={() => {
              playRoboSound('tap', soundEffects);
              setStep(currentStep + 1);
            }}
          >
            <span>{isTr ? 'Devam Et' : 'Continue'}</span>
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="bedo-tour-btn primary"
            onClick={() => {
              playRoboSound('happy', soundEffects);
              onComplete?.();
            }}
          >
            <span>{isTr ? 'Başlayalım' : 'Get Started'}</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
