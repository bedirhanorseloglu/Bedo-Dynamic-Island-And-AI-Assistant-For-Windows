import React, { useState, useEffect, useRef } from 'react';
import { playRoboSound } from './sounds';

// Shared blink coordinator so all visible RoboEyes instances blink in unison.
const blinkSubscribers = new Set();
let sharedBlinkTimer = null;
let sharedBlinkResetTimer = null;

function scheduleSharedBlink() {
  if (sharedBlinkTimer || blinkSubscribers.size === 0) return;
  sharedBlinkTimer = setTimeout(() => {
    sharedBlinkTimer = null;
    blinkSubscribers.forEach((cb) => cb(true));
    clearTimeout(sharedBlinkResetTimer);
    sharedBlinkResetTimer = setTimeout(() => {
      blinkSubscribers.forEach((cb) => cb(false));
      scheduleSharedBlink();
    }, 150);
  }, 3600 + Math.random() * 2200);
}

function subscribeBlink(cb) {
  blinkSubscribers.add(cb);
  scheduleSharedBlink();
  return () => {
    blinkSubscribers.delete(cb);
    if (blinkSubscribers.size === 0) {
      clearTimeout(sharedBlinkTimer);
      clearTimeout(sharedBlinkResetTimer);
      sharedBlinkTimer = null;
      sharedBlinkResetTimer = null;
    }
  };
}

function resolveEffectiveOutfit(outfit, seasonalOutfits) {
  if (seasonalOutfits) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    if ((m === 12 && d >= 20) || (m === 1 && d <= 2)) return 'Santa';
    if ((m === 10 && d >= 25) || (m === 11 && d <= 1)) return 'Witch';
  }
  return outfit || 'None';
}

export default function RoboEyes({ mood = 'normal', reaction = null, active = true, trackCursor = true, blinkingEnabled = true, outfit = 'None', seasonalOutfits = false, onPoke, size = 'normal', micLevel = 0, showMouth = false, batteryPercent, batteryCharging = false, unreadNotificationCount = 0, pendingAgendaCount = 0, forcedLook = null, demoEyeState = null }) {
  const [blink, setBlink] = useState(false);
  const [wakePhase, setWakePhase] = useState('closed'); // 'closed' | 'flutter' | 'look-left' | 'look-right' | 'happy' | 'done'
  const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });
  const [pokeCount, setPokeCount] = useState(0);
  const [isDizzy, setIsDizzy] = useState(false);
  const [pokeAction, setPokeAction] = useState('');
  const containerRef = useRef(null);
  const blinkTimerRef = useRef(null);
  const pokeTimerRef = useRef(null);
  const dizzyTimerRef = useRef(null);
  const lastLookUpdateRef = useRef(0);
  const hasWokenRef = useRef(false);

  // Smoothly open eyes once when a visible Robo instance first becomes active.
  useEffect(() => {
    if (!active || hasWokenRef.current) return undefined;
    const t = setTimeout(() => {
      setWakePhase('done');
      hasWokenRef.current = true;
    }, 260);
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => () => {
    clearTimeout(pokeTimerRef.current);
    clearTimeout(dizzyTimerRef.current);
  }, []);

  // Subscribe to the shared blink coordinator so all visible Robo instances blink together.
  useEffect(() => {
    if (!active || !blinkingEnabled || mood === 'music' || mood === 'dnd-sleep') {
      setBlink(false);
      return undefined;
    }
    return subscribeBlink(setBlink);
  }, [active, blinkingEnabled, mood]);

  // Subtle eye tracking toward cursor (disabled in idle or when forcedLook overrides gaze)
  useEffect(() => {
    if (!active || !trackCursor || forcedLook) return undefined;
    let cachedCenter = null;
    let ro = null;

    const updateCenter = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        cachedCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    };

    const rafId = requestAnimationFrame(updateCenter);
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateCenter);
      ro.observe(containerRef.current);
    }

    const handleMove = (e) => {
      const now = performance.now();
      if (now - lastLookUpdateRef.current < 50) return;
      lastLookUpdateRef.current = now;
      if (!cachedCenter) updateCenter();
      if (!cachedCenter) return;
      const dx = Math.max(-3.5, Math.min(3.5, (e.clientX - cachedCenter.x) / 70));
      const dy = Math.max(-2.5, Math.min(2.5, (e.clientY - cachedCenter.y) / 70));
      setLookOffset((current) =>
        Math.abs(current.x - dx) < 0.35 && Math.abs(current.y - dy) < 0.35
          ? current
          : { x: dx, y: dy }
      );
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('mousemove', handleMove);
    };
  }, [active, trackCursor, forcedLook]);

  const handleClick = (e) => {
    e.stopPropagation();
    const next = pokeCount + 1;
    setPokeCount(next);
    setPokeAction(next % 2 === 0 ? 'poke-dance' : 'poke-boop');
    clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = setTimeout(() => setPokeAction(''), 900);
    if (next >= 4) {
      setIsDizzy(true);
      playRoboSound('dizzy', true);
      clearTimeout(dizzyTimerRef.current);
      dizzyTimerRef.current = setTimeout(() => {
        setIsDizzy(false);
        setPokeCount(0);
      }, 3500);
    } else {
      playRoboSound('wink', true);
    }
    if (onPoke) onPoke(next >= 4 ? 'dizzy' : 'wink');
  };

  const normalizedMood = String(mood || 'normal')
    .toLowerCase()
    .replace(/\s+/g, '');

  const activeMood = isDizzy
    ? 'dizzy'
    : normalizedMood === 'music'
    ? 'music'
    : wakePhase !== 'done'
    ? `wake-${wakePhase}`
    : normalizedMood;
  const activeReaction = isDizzy ? '' : pokeAction || (active ? reaction?.name || '' : '');

  const scale = size === 'mini' ? 0.58 : size === 'large' ? 1.6 : size === 'small' ? 0.82 : 1;

  const hasForcedLook = Boolean(
    forcedLook && Number.isFinite(forcedLook.x) && Number.isFinite(forcedLook.y)
  );
  const clampedForcedX = hasForcedLook ? Math.max(-5, Math.min(5, forcedLook.x)) : 0;
  const clampedForcedY = hasForcedLook ? Math.max(-3.5, Math.min(3.5, forcedLook.y)) : 0;

  const wakeShiftX =
    wakePhase === 'look-left'
      ? -3.5
      : wakePhase === 'look-right'
      ? 3.5
      : hasForcedLook
      ? clampedForcedX
      : lookOffset.x;
  const wakeShiftY =
    wakePhase === 'closed' ? 1.5 : hasForcedLook ? clampedForcedY : lookOffset.y;

  const isHeartEyes = activeMood === 'inlove' || activeMood === 'love';
  const isLowBattery = !batteryCharging && Number.isFinite(batteryPercent) && batteryPercent <= 20;
  const isFocus = activeMood === 'focus-arc' || activeMood === 'focus';
  const isDndSleep = activeMood === 'dnd-sleep';
  const effectiveOutfit = resolveEffectiveOutfit(outfit, seasonalOutfits);
  const showCrown = effectiveOutfit === 'Crown';
  const showPartyHat = effectiveOutfit === 'Party hat';
  const showSunglasses = !isFocus && effectiveOutfit === 'Sunglasses';
  const showHeadphones = effectiveOutfit === 'Headphones';
  const showBeanie = effectiveOutfit === 'Beanie';
  const showHalo = effectiveOutfit === 'Halo';
  const showBowtie = effectiveOutfit === 'Bowtie';
  const showSantaHat = effectiveOutfit === 'Santa';
  const showWitchHat = effectiveOutfit === 'Witch';
  const isTurbo = activeMood === 'turbo';
  const isThinking = activeMood === 'thinking' || activeReaction === 'thinking';
  const isSpeaking = activeMood === 'speaking' || activeReaction === 'speaking';
  const isBellAlert = activeReaction === 'notification';
  const hasUnread = unreadNotificationCount > 0;
  const hasPendingAgenda = pendingAgendaCount > 0;

  const effectiveCharging = demoEyeState ? demoEyeState === 'charging' : batteryCharging;
  const effectiveLowBattery = demoEyeState ? demoEyeState === 'low-battery' : isLowBattery;
  const effectiveUnread = demoEyeState ? demoEyeState === 'unread' : hasUnread;
  const effectivePendingAgenda = demoEyeState ? demoEyeState === 'agenda' : hasPendingAgenda;

  const statusHints = [];
  if (effectiveCharging) statusHints.push('Şarj oluyor');
  if (hasUnread) statusHints.push(`${unreadNotificationCount} açılmamış bildirim`);
  if (hasPendingAgenda) statusHints.push(`${pendingAgendaCount} bekleyen ajanda`);
  const roboTitle = statusHints.length ? `Robo · ${statusHints.join(' · ')}` : 'Robo';

  return (
    <div
      ref={containerRef}
      className={`robo-eyes-wrap ${activeMood} ${activeReaction ? `reaction-${activeReaction}` : ''} ${!active ? 'is-inactive' : ''} ${effectiveCharging ? 'is-charging' : ''} ${effectiveLowBattery ? 'is-low-battery' : ''} ${effectiveUnread ? 'has-unread' : ''} ${effectivePendingAgenda ? 'has-pending-agenda' : ''}`}
      onClick={handleClick}
      title={roboTitle}
      style={{
        transform: `scale(${scale}) translate(${wakeShiftX}px, ${wakeShiftY}px)`,
        transition: hasForcedLook ? 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
      }}
    >
      <span className="robo-mood-spark" aria-hidden="true" />
      <span className="robo-body-antenna" aria-hidden="true" />
      <span className="robo-body-dome" aria-hidden="true" />
      {showCrown && (
        <svg className="robo-prop-crown" viewBox="0 0 24 14" aria-hidden="true">
          <polygon points="2,12 2,4 7,8 12,2 17,8 22,4 22,12" fill="#fbbf24" stroke="#fde047" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )}
      {showPartyHat && (
        <svg className="robo-prop-party" viewBox="0 0 20 16" aria-hidden="true">
          <polygon points="3,14 10,2 17,14" fill="#a855f7" stroke="#f472b6" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="10" cy="2" r="2" fill="#fde047" />
        </svg>
      )}
      {showSantaHat && (
        <svg className="robo-prop-party" viewBox="0 0 22 16" aria-hidden="true">
          <path d="M3 13 C5 4, 15 2, 18 9 L19 13 Z" fill="#ef4444" />
          <rect x="2" y="12" width="17" height="3" rx="1.5" fill="#ffffff" />
          <circle cx="19" cy="10" r="2" fill="#ffffff" />
        </svg>
      )}
      {showWitchHat && (
        <svg className="robo-prop-party" viewBox="0 0 24 16" aria-hidden="true">
          <polygon points="5,13 12,1 19,13" fill="#4c1d95" stroke="#a78bfa" strokeWidth="1.1" />
          <rect x="1" y="12" width="22" height="2.5" rx="1.2" fill="#3b0764" />
        </svg>
      )}
      {showSunglasses && (
        <svg className="robo-prop-sunglasses" viewBox="0 0 38 14" aria-hidden="true">
          <rect x="1.5" y="2" width="14" height="10" rx="3" fill="rgba(10,12,18,0.9)" stroke="#e2e8f0" strokeWidth="1.3" />
          <rect x="22.5" y="2" width="14" height="10" rx="3" fill="rgba(10,12,18,0.9)" stroke="#e2e8f0" strokeWidth="1.3" />
          <path d="M15.5 6h7" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {showHeadphones && (
        <svg className="robo-prop-headphones" viewBox="0 0 44 26" aria-hidden="true">
          <path d="M6 16 C6 5, 38 5, 38 16" fill="none" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="2" y="13" width="6" height="10" rx="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.4" />
          <rect x="36" y="13" width="6" height="10" rx="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.4" />
        </svg>
      )}
      {showBeanie && (
        <svg className="robo-prop-party" viewBox="0 0 24 16" aria-hidden="true">
          <path d="M4 13 C4 5, 20 5, 20 13 Z" fill="#f97316" />
          <rect x="3" y="11.5" width="18" height="3.2" rx="1.6" fill="#fb923c" />
          <circle cx="12" cy="4" r="2.1" fill="#fed7aa" />
        </svg>
      )}
      {showHalo && (
        <svg className="robo-prop-halo" viewBox="0 0 26 10" aria-hidden="true">
          <ellipse cx="13" cy="5" rx="10" ry="3" fill="none" stroke="#fde047" strokeWidth="2" />
        </svg>
      )}
      {showBowtie && (
        <svg className="robo-prop-bowtie" viewBox="0 0 22 12" aria-hidden="true">
          <polygon points="2,2 11,6 2,10" fill="#f43f5e" />
          <polygon points="20,2 11,6 20,10" fill="#f43f5e" />
          <circle cx="11" cy="6" r="2.2" fill="#fda4af" />
        </svg>
      )}
      {isFocus && (
        <span className="robo-prop-focus-visor" aria-hidden="true" />
      )}
      {isDndSleep && (
        <span className="robo-prop-sleep" aria-hidden="true">zZ</span>
      )}
      {isThinking && (
        <span className="robo-prop-thinking" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
      {isHeartEyes ? (
        <>
          <span className="robo-heart-eye left">♥</span>
          <span className="robo-heart-eye right">♥</span>
        </>
      ) : (
        <>
          <span className={`robo-eye left ${blink ? 'blinking' : ''} ${activeMood}`} />
          <span className={`robo-eye right ${blink ? 'blinking' : ''} ${activeMood}`} />
        </>
      )}
      {showMouth && isSpeaking && (
        <span className="robo-talking-mouth" aria-hidden="true">
          <span className="robo-talking-mouth-inner" />
        </span>
      )}
    </div>
  );
}
