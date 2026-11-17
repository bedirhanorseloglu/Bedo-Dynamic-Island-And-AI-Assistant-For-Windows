import React from 'react';
import { Mic, MicOff, Pause, Play, Video, VideoOff } from 'lucide-react';

const STATE_LABELS = {
  INITIALISING: 'Hazırlanıyor',
  LISTENING: 'Dinliyor',
  THINKING: 'Düşünüyor',
  SPEAKING: 'Konuşuyor',
  ERROR: 'Bağlantı Hatası',
};

export default function BedoStatusBar({
  status,
  webcamFrame,
  onToggleMute,
  onTogglePause,
  onToggleWebcam,
}) {
  const paused = Boolean(status?.paused);
  const muted = Boolean(status?.muted);
  const webcamActive = Boolean(status?.webcamActive);
  const running = Boolean(status?.running);
  const jarvisState = status?.jarvisState || 'INITIALISING';

  const label = !running
    ? 'Çevrimdışı'
    : paused
      ? 'Uyku ("Hey Bedo" bekliyor)'
      : STATE_LABELS[jarvisState] || jarvisState;

  const dotClass = !running
    ? 'is-offline'
    : paused
      ? 'is-sleeping'
      : jarvisState === 'SPEAKING'
        ? 'is-speaking'
        : jarvisState === 'ERROR'
          ? 'is-error'
          : 'is-listening';

  return (
    <div className="bedo-status-bar">
      <div className="bedo-status-left">
        <span className={`bedo-status-dot ${dotClass}`} />
        <span className="bedo-status-label">{label}</span>
      </div>

      {webcamActive && webcamFrame && (
        <img
          src={webcamFrame}
          alt="Bedo Kamera"
          className="bedo-webcam-thumb"
        />
      )}

      <div className="bedo-status-actions">
        <button
          type="button"
          className={`bedo-ctrl-btn ${!paused ? 'is-active' : ''}`}
          onClick={onTogglePause}
          title={paused ? 'Bedo’yu Uyandır' : 'Uyku Moduna Al'}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          type="button"
          className={`bedo-ctrl-btn ${muted ? 'is-muted' : ''}`}
          onClick={onToggleMute}
          title={muted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
        >
          {muted ? <MicOff size={13} /> : <Mic size={13} />}
        </button>
        <button
          type="button"
          className={`bedo-ctrl-btn ${webcamActive ? 'is-active' : ''}`}
          onClick={onToggleWebcam}
          title={webcamActive ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
        >
          {webcamActive ? <Video size={13} /> : <VideoOff size={13} />}
        </button>
      </div>
    </div>
  );
}
