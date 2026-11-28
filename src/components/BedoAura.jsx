import React, { useEffect, useRef } from 'react';

const MODE_CONFIG = {
  sleeping: {
    r: 129, g: 140, b: 248,
    r2: 168, g2: 85, b2: 247,
    speed: 0.014, glow: 0.16, orbit: 0.08,
  },
  listening: {
    r: 56, g: 189, b: 248,
    r2: 59, g2: 130, b2: 246,
    speed: 0.028, glow: 0.28, orbit: 0.14,
  },
  thinking: {
    r: 251, g: 191, b: 36,
    r2: 168, g2: 85, b2: 247,
    speed: 0.048, glow: 0.3, orbit: 0.2,
  },
  speaking: {
    r: 52, g: 211, b: 153,
    r2: 56, g2: 189, b2: 248,
    speed: 0.056, glow: 0.36, orbit: 0.22,
  },
  error: {
    r: 248, g: 113, b: 113,
    r2: 239, g2: 68, b2: 68,
    speed: 0.025, glow: 0.28, orbit: 0.1,
  },
};

export default function BedoAura({ mode = 'listening', active = true }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let lastDrawTime = 0;
    const FRAME_INTERVAL_MS = 1000 / 60;
    const current = { ...MODE_CONFIG[modeRef.current] || MODE_CONFIG.listening };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    const draw = (now = performance.now()) => {
      rafId = requestAnimationFrame(draw);
      const elapsed = lastDrawTime ? now - lastDrawTime : FRAME_INTERVAL_MS;
      if (lastDrawTime && elapsed < FRAME_INTERVAL_MS * 0.88) {
        return;
      }
      const dtScale = Math.min(2.5, Math.max(0.5, elapsed / FRAME_INTERVAL_MS));
      lastDrawTime = now;

      const target = MODE_CONFIG[modeRef.current] || MODE_CONFIG.listening;
      const lerp = 1 - Math.pow(1 - 0.08, dtScale);
      current.r += (target.r - current.r) * lerp;
      current.g += (target.g - current.g) * lerp;
      current.b += (target.b - current.b) * lerp;
      current.r2 += (target.r2 - current.r2) * lerp;
      current.g2 += (target.g2 - current.g2) * lerp;
      current.b2 += (target.b2 - current.b2) * lerp;
      current.speed += (target.speed - current.speed) * lerp;
      current.glow += (target.glow - current.glow) * lerp;
      current.orbit += (target.orbit - current.orbit) * lerp;

      phase += current.speed * dtScale;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Tüm genişliğe (kenardan kenara) eşit yayılan yumuşak aura katmanları
      const span = Math.max(w, h) * 1.25;
      const blobs = [
        {
          cx: w * (0.25 + Math.sin(phase * 0.6) * current.orbit * 0.45),
          cy: h * (0.5 + Math.cos(phase * 0.45) * 0.12),
          rad: span,
          r: current.r,
          g: current.g,
          b: current.b,
          alpha: current.glow * 0.75,
        },
        {
          cx: w * (0.75 + Math.cos(phase * 0.55) * current.orbit * 0.45),
          cy: h * (0.5 + Math.sin(phase * 0.5) * 0.12),
          rad: span,
          r: current.r2,
          g: current.g2,
          b: current.b2,
          alpha: current.glow * 0.7,
        },
      ];

      ctx.globalCompositeOperation = 'lighter';
      for (const blob of blobs) {
        const grad = ctx.createRadialGradient(
          blob.cx,
          blob.cy,
          0,
          blob.cx,
          blob.cy,
          blob.rad
        );
        grad.addColorStop(
          0,
          `rgba(${Math.round(blob.r)}, ${Math.round(blob.g)}, ${Math.round(blob.b)}, ${blob.alpha.toFixed(3)})`
        );
        grad.addColorStop(
          0.45,
          `rgba(${Math.round(blob.r)}, ${Math.round(blob.g)}, ${Math.round(blob.b)}, ${(blob.alpha * 0.35).toFixed(3)})`
        );
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="bedo-aura-canvas" aria-hidden="true" />;
}
