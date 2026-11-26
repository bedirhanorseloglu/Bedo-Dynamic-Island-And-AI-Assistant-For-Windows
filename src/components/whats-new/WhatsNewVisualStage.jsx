import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import RoboEyes from '../../RoboEyes';

const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 };

function ProviderGlyph({ id }) {
  if (id === 'claude') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 1.8L13.55 7.95L18.1 3.45L15.6 9.3L21.7 8.1L16.35 11.4L22.2 13.75L16.05 13.95L19.45 19.15L14.2 15.65L13.95 21.8L11.9 16.0L8.85 21.45L9.95 15.35L4.35 18.2L8.45 13.5L2.25 12.75L8.05 10.65L3.1 6.75L9.15 8.55L7.65 2.45L11.2 7.75L12 1.8Z"
          fill="#D97757"
        />
      </svg>
    );
  }
  if (id === 'codex') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6.8 18.5C4.1 18.5 2 16.4 2 13.8C2 11.5 3.65 9.6 5.85 9.2C6.65 6.2 9.4 4 12.65 4C16.35 4 19.4 6.8 19.65 10.4C21.05 10.95 22 12.3 22 13.9C22 16.45 19.9 18.5 17.3 18.5H6.8Z"
          fill="#F4F4F5"
        />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.4C14.3 2.4 16.05 6.25 18.2 12.1C19.6 15.9 21.15 18.95 21.65 20.15C22.05 21.1 21.25 22 20.15 21.7C18.05 21.1 16.4 18.75 15.1 15.85C14.1 13.65 13.15 12.5 12 12.5C10.85 12.5 9.9 13.65 8.9 15.85C7.6 18.75 5.95 21.1 3.85 21.7C2.75 22 1.95 21.1 2.35 20.15C2.85 18.95 4.4 15.9 5.8 12.1C7.95 6.25 9.7 2.4 12 2.4Z"
        fill="#60A5FA"
      />
    </svg>
  );
}

/**
 * Scene 1: Minimal monitor silhouette — Island expands gracefully at top while
 * duplicate bottom-right Windows popup dissolves away.
 */
function IslandOnlyBannersScene({ outfit, seasonalOutfits }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExpanded(true), 420);
    const loop = setInterval(() => {
      setExpanded(false);
      setTimeout(() => setExpanded(true), 780);
    }, 3600);
    return () => {
      clearTimeout(t1);
      clearInterval(loop);
    };
  }, []);

  return (
    <div className="wn-display-frame" aria-hidden="true">
      <motion.div
        className="wn-sim-island"
        animate={{
          width: expanded ? 188 : 76,
          height: expanded ? 34 : 20,
          borderRadius: 999,
        }}
        transition={SPRING}
      >
        <div className="wn-sim-eyes">
          <RoboEyes
            mood={expanded ? 'happy' : 'normal'}
            active={true}
            trackCursor={false}
            blinkingEnabled={true}
            outfit={outfit || 'None'}
            seasonalOutfits={seasonalOutfits}
            size="small"
          />
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              className="wn-sim-notif-bars"
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <span className="wn-bar-primary" />
              <span className="wn-bar-secondary" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Bottom-right duplicate OS popup smoothly vanishing */}
      <motion.div
        className="wn-sim-os-toast"
        animate={{
          opacity: expanded ? 0 : 0.42,
          scale: expanded ? 0.92 : 1,
          y: expanded ? 4 : 0,
        }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="wn-os-sq" />
        <div className="wn-sim-notif-bars">
          <span className="wn-bar-primary is-dim" />
          <span className="wn-bar-secondary is-dim" />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Scene 2: Island tucks into an ultra-thin hairline when fullscreen activates,
 * and smoothly returns on exit.
 */
function GameTurboScene({ outfit, seasonalOutfits }) {
  const [stealth, setStealth] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStealth(true), 700);
    const loop = setInterval(() => {
      setStealth((prev) => !prev);
    }, 2100);
    return () => {
      clearTimeout(t1);
      clearInterval(loop);
    };
  }, []);

  return (
    <div className={`wn-display-frame ${stealth ? 'is-fullscreen' : ''}`} aria-hidden="true">
      <motion.div
        className="wn-sim-island"
        animate={{
          width: stealth ? 64 : 136,
          height: stealth ? 5 : 28,
          opacity: stealth ? 0.28 : 1,
          borderRadius: 999,
        }}
        transition={SPRING}
      >
        {!stealth && (
          <div className="wn-sim-eyes is-centered">
            <RoboEyes
              mood="normal"
              active={true}
              trackCursor={false}
              blinkingEnabled={true}
              outfit={outfit || 'None'}
              seasonalOutfits={seasonalOutfits}
              size="small"
            />
          </div>
        )}
      </motion.div>

      <div className="wn-corners" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

/**
 * Scene 3: Live agent pulse — Bedo glances calmly toward active coding agents.
 */
function AgentBridgeScene({ outfit, seasonalOutfits }) {
  const agents = ['claude', 'codex', 'agy'];
  const looks = [
    { x: -3.2, y: 1.8 },
    { x: 0, y: 2.2 },
    { x: 3.2, y: 1.8 },
  ];
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % agents.length);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wn-display-frame is-agents" aria-hidden="true">
      <div className="wn-sim-island is-agent-host">
        <div className="wn-sim-eyes is-centered">
          <RoboEyes
            mood="happy"
            active={true}
            trackCursor={false}
            forcedLook={looks[activeIdx]}
            blinkingEnabled={true}
            outfit={outfit || 'None'}
            seasonalOutfits={seasonalOutfits}
            size="small"
          />
        </div>
      </div>

      <div className="wn-agent-dock">
        {agents.map((id, idx) => (
          <motion.div
            key={id}
            className={`wn-agent-orb ${idx === activeIdx ? 'is-active' : ''}`}
            animate={{
              y: idx === activeIdx ? -3 : 0,
              scale: idx === activeIdx ? 1.06 : 0.96,
            }}
            transition={SPRING}
          >
            <ProviderGlyph id={id} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Scene 4: Minimal Chat Studio threads + live streaming reply with user's Bedo.
 */
function ChatStudioScene({ outfit, seasonalOutfits }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wn-display-frame is-chat" aria-hidden="true">
      <div className="wn-chat-sidebar">
        {[0, 1, 2].map((idx) => (
          <span key={idx} className={`wn-chat-thread-dot ${phase === idx ? 'is-active' : ''}`} />
        ))}
      </div>
      <div className="wn-chat-canvas">
        <div className="wn-chat-user-pill" />
        <div className="wn-chat-reply-row">
          <div className="wn-sim-eyes">
            <RoboEyes
              mood="happy"
              active={true}
              trackCursor={false}
              blinkingEnabled={true}
              outfit={outfit || 'None'}
              seasonalOutfits={seasonalOutfits}
              size="small"
            />
          </div>
          <motion.div
            key={phase}
            className="wn-chat-stream-lines"
            initial={{ opacity: 0.35, width: 54 }}
            animate={{ opacity: 1, width: 112 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="wn-bar-primary" />
            <span className="wn-bar-secondary" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/**
 * Scene 5: Live battery ETA & smooth ambient volume HUD capsule.
 */
function AmbientHudScene({ outfit, seasonalOutfits }) {
  const [level, setLevel] = useState(0.38);

  useEffect(() => {
    const id = setInterval(() => {
      setLevel((prev) => (prev < 0.7 ? 0.82 : 0.42));
    }, 1700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wn-display-frame is-hud" aria-hidden="true">
      <div className="wn-sim-island is-hud-pill">
        <div className="wn-sim-eyes">
          <RoboEyes
            mood="normal"
            active={true}
            trackCursor={false}
            blinkingEnabled={true}
            outfit={outfit || 'None'}
            seasonalOutfits={seasonalOutfits}
            size="small"
          />
        </div>
        <div className="wn-hud-track">
          <motion.div
            className="wn-hud-fill"
            animate={{ scaleX: level }}
            transition={SPRING}
          />
        </div>
        <span className="wn-hud-eta">4s 18dk</span>
      </div>
    </div>
  );
}

export default function WhatsNewVisualStage({
  preset = 'island-only-banners',
  outfit = 'None',
  seasonalOutfits = false,
}) {
  return (
    <div className="wn-stage">
      <AnimatePresence mode="wait">
        <motion.div
          key={preset}
          className="wn-stage-slot"
          initial={{ opacity: 0, scale: 0.97, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -6 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {preset === 'chat-studio' ? (
            <ChatStudioScene outfit={outfit} seasonalOutfits={seasonalOutfits} />
          ) : preset === 'ambient-hud' ? (
            <AmbientHudScene outfit={outfit} seasonalOutfits={seasonalOutfits} />
          ) : preset === 'game-turbo' ? (
            <GameTurboScene outfit={outfit} seasonalOutfits={seasonalOutfits} />
          ) : preset === 'agent-bridge' ? (
            <AgentBridgeScene outfit={outfit} seasonalOutfits={seasonalOutfits} />
          ) : (
            <IslandOnlyBannersScene outfit={outfit} seasonalOutfits={seasonalOutfits} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
