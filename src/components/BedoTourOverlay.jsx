import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
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
    detailTr: 'Her şey yolunda, beklemede',
    detailEn: 'All clear, standing by',
  },
  {
    id: 'charging',
    color: '#49e39a',
    glow: 'rgba(73, 227, 154, 0.34)',
    labelTr: 'Şarj Oluyor',
    labelEn: 'Charging',
    detailTr: 'Cihaz güce bağlı',
    detailEn: 'Connected to power',
  },
  {
    id: 'low-battery',
    color: '#ff4d5e',
    glow: 'rgba(255, 77, 94, 0.36)',
    labelTr: 'Düşük Pil',
    labelEn: 'Low Battery',
    detailTr: 'Pil %20 ve altında',
    detailEn: 'Battery at 20% or below',
  },
  {
    id: 'unread',
    color: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.34)',
    labelTr: 'Bildirim',
    labelEn: 'Notification',
    detailTr: 'Okunmamış bildirim · Sağ göz kırpar',
    detailEn: 'Unread notification · Right eye winks',
  },
  {
    id: 'agenda',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.34)',
    labelTr: 'Ajanda',
    labelEn: 'Agenda',
    detailTr: 'Yaklaşan etkinlik hatırlatması',
    detailEn: 'Upcoming calendar event',
  },
];

const TOUR_SCENES = [
  {
    id: 'presence',
    mood: 'happy',
    look: { x: 0, y: 0 },
    aura: 'rgba(148, 163, 184, 0.2)',
    titleTr: 'Üzerine gel, canlansın.',
    titleEn: 'Hover to wake.',
    descTr: 'Ekranın tepesinde sessizce beklerim. Fareyi yaklaştırdığında açılır, işin bitince geri toplanırım.',
    descEn: 'I rest quietly at the top of your screen. Hover to expand, and I’ll tuck back in when you’re done.',
  },
  {
    id: 'right-click',
    mood: 'normal',
    look: { x: 0, y: -2.6 },
    aura: 'rgba(56, 189, 248, 0.22)',
    titleTr: 'Sağ tıkla, incecik kal.',
    titleEn: 'Right-click to shrink.',
    descTr: 'Film izlerken veya odaklanırken üzerime sağ tıkla — mini çubuğa küçülürüm. Tekrar sağ tıkla geri büyürüm.',
    descEn: 'Right-click anytime to collapse into a slim bar. Right-click again to restore.',
  },
  {
    id: 'eye-colors',
    mood: 'normal',
    look: { x: 0, y: 0 },
    aura: 'rgba(255, 255, 255, 0.2)',
    titleTr: 'Tek bakışta durum.',
    titleEn: 'Status at a glance.',
    descTr: 'Gözlerimin rengi sana her şeyi sessizce söyler.',
    descEn: 'My eye color silently tells you what’s happening.',
  },
  {
    id: 'ai-and-secret',
    mood: 'inlove',
    look: { x: 0, y: 2.8 },
    aura: 'rgba(244, 114, 182, 0.22)',
    titleTr: 'Konuş, paylaş… ya da dürt.',
    titleEn: 'Talk, share… or poke.',
    descTr: 'Bana yazabilir, seslenebilir veya DropShare ile dosya atabilirsin. Gözlerime 4 kez tıklarsan başım döner.',
    descEn: 'Type, speak, or drop files with DropShare. Tap my eyes 4 times for a dizzy surprise.',
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
    setMorphPhase('pill');
    setPresenceLook({ x: -3.2, y: 0 });
    const t1 = setTimeout(() => {
      setMorphPhase('expanded');
      setPresenceLook({ x: 3.0, y: 0 });
    }, 650);
    const t2 = setTimeout(() => setPresenceLook({ x: 0, y: 0 }), 1250);
    const loop = setInterval(() => {
      setMorphPhase('pill');
      setPresenceLook({ x: -2.4, y: 0 });
      setTimeout(() => {
        setMorphPhase('expanded');
        setPresenceLook({ x: 0, y: 0 });
      }, 950);
    }, 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(loop);
    };
  }, [open, scene.id]);

  // Scene 2: right-click -> shrink to slim mini bar -> restore loop
  useEffect(() => {
    if (!open || scene.id !== 'right-click') return undefined;
    setMorphPhase('expanded');
    const runCycle = () => {
      setMorphPhase('expanded');
      setTimeout(() => setMorphPhase('mini'), 1100);
      setTimeout(() => setMorphPhase('expanded'), 2600);
    };
    const initTimer = setTimeout(runCycle, 250);
    const loop = setInterval(runCycle, 3800);
    return () => {
      clearTimeout(initTimer);
      clearInterval(loop);
    };
  }, [open, scene.id]);

  // Scene 3: smooth 1-by-1 eye color showcase
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
                  className="bedo-tour-click-ring"
                  animate={{
                    scale: morphPhase === 'mini' ? [0.6, 1.55] : 0.6,
                    opacity: morphPhase === 'mini' ? [0.85, 0] : 0,
                  }}
                  transition={{ duration: 0.55 }}
                />
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
