import React, { useEffect, useRef } from 'react';

export default function MirrorOverlay({ onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 480, height: 360 }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="mirror-overlay-view">
      <video ref={videoRef} autoPlay playsInline muted className="mirror-video-feed" />
      <button type="button" className="mirror-close-pill" onClick={onClose}>
        Kapat
      </button>
    </div>
  );
}

