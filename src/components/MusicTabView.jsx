import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Laptop,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import { playRoboSound } from '../sounds';

export function formatMMSS(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function useIsolatedMediaPosition(
  liveMedia,
  active,
  isScrubbing = false,
  intervalMs = 500
) {
  const [pos, setPos] = useState(() =>
    typeof liveMedia?.position === 'number' ? liveMedia.position : 0
  );
  const lastTickRef = useRef(Date.now());
  const mediaRef = useRef(liveMedia);
  mediaRef.current = liveMedia;

  useEffect(() => {
    if (!isScrubbing && liveMedia && typeof liveMedia.position === 'number') {
      setPos(liveMedia.position);
      lastTickRef.current = Date.now();
    }
  }, [liveMedia?.position, liveMedia?.title, isScrubbing]);

  useEffect(() => {
    if (!active || !liveMedia?.isPlaying || isScrubbing) return undefined;
    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(1.5, Math.max(0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      const m = mediaRef.current;
      if (!m || !m.hasSession || !m.isPlaying) return;
      setPos((prev) => {
        const next = prev + elapsed;
        return m.duration > 0 ? Math.min(m.duration, next) : next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, liveMedia?.isPlaying, isScrubbing, intervalMs]);

  return [pos, setPos];
}

const MusicScrubber = React.memo(function MusicScrubber({
  currentMedia,
  active,
  onSeek,
  onInteractionStart,
}) {
  const trackRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(null);
  const [pos, setPos] = useIsolatedMediaPosition(currentMedia, active, isScrubbing, 450);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const canSeek = Boolean(
    currentMedia.hasSession && currentMedia.duration && currentMedia.duration > 0
  );

  const calculateScrubSeconds = (clientX) => {
    if (!trackRef.current || !currentMedia.duration || currentMedia.duration <= 0) return null;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * currentMedia.duration;
  };

  const handleMouseDown = (e) => {
    if (!canSeek) return;
    e.preventDefault();
    e.stopPropagation();
    onInteractionStart?.();

    dragCleanupRef.current?.();
    setIsScrubbing(true);

    const startSec = calculateScrubSeconds(e.clientX);
    if (startSec !== null) {
      setScrubPosition(startSec);
      setPos(startSec);
    }

    const handleMouseMove = (moveEvent) => {
      onInteractionStart?.();
      const moveSec = calculateScrubSeconds(moveEvent.clientX);
      if (moveSec !== null) {
        setScrubPosition(moveSec);
        setPos(moveSec);
      }
    };

    const handleMouseUp = (upEvent) => {
      cleanup();
      setIsScrubbing(false);
      const finalSec = calculateScrubSeconds(upEvent.clientX);
      setScrubPosition(null);
      if (finalSec !== null) {
        setPos(finalSec);
        onSeek?.(finalSec);
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleKeyDown = (e) => {
    if (!canSeek) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.key === 'ArrowRight' ? 5 : -5;
      const nextSec = Math.max(0, Math.min(currentMedia.duration, (pos || 0) + delta));
      setPos(nextSec);
      onSeek?.(nextSec);
    }
  };

  const displayPos = isScrubbing && scrubPosition !== null ? scrubPosition : pos;
  const pct =
    currentMedia.duration > 0
      ? Math.min(100, Math.max(0, ((displayPos || 0) / currentMedia.duration) * 100))
      : 0;

  return (
    <div className="music-progress-row">
      <span className="music-time-label">{formatMMSS(displayPos)}</span>
      <div
        ref={trackRef}
        className={`music-scrubber-track ${isScrubbing ? 'is-scrubbing' : ''} ${
          canSeek ? '' : 'is-disabled'
        }`}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Parça ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={currentMedia.duration || 0}
        aria-valuenow={Math.round(displayPos || 0)}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="music-scrubber-fill" style={{ width: `${pct}%` }} />
        <div className="music-scrubber-thumb" style={{ left: `${pct}%` }} />
      </div>
      <span className="music-time-label music-time-remaining">
        -{formatMMSS(Math.max(0, (currentMedia.duration || 0) - (displayPos || 0)))}
      </span>
    </div>
  );
});

export default function MusicTabView({
  currentMedia,
  active,
  hasSyncedLyrics,
  activeLyricIndex,
  primaryLine,
  secondaryLine,
  showMusicServicePicker,
  setShowMusicServicePicker,
  showPlayOnPopover,
  setShowPlayOnPopover,
  onOpenMediaSource,
  onLaunchMusicService,
  onPrev,
  onPlayPause,
  onNext,
  onSeek,
  onInteractionStart,
  soundEffectsEnabled,
  t,
}) {
  const deviceWrapRef = useRef(null);

  useEffect(() => {
    if (!showPlayOnPopover) return undefined;
    const handleOutsidePointerDown = (e) => {
      if (deviceWrapRef.current && !deviceWrapRef.current.contains(e.target)) {
        setShowPlayOnPopover(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [showPlayOnPopover, setShowPlayOnPopover]);

  const subtitleText = currentMedia.artist || currentMedia.album || '';
  const showTitleInHeader = Boolean(
    currentMedia.hasSession && hasSyncedLyrics && activeLyricIndex >= 0
  );

  return (
    <div className={`music-view ${currentMedia.isPlaying ? 'is-playing' : 'is-paused'}`}>
      {/* Left: Album Art */}
      <div className="music-art-column">
        <div
          className={`music-cover-art ${currentMedia.thumbnail ? 'has-art' : ''}`}
          onClick={currentMedia.hasSession ? onOpenMediaSource : undefined}
          title={currentMedia.hasSession ? t('home.openMediaSource') : undefined}
          style={currentMedia.hasSession ? { cursor: 'pointer' } : undefined}
        >
          {currentMedia.thumbnail ? (
            <img
              src={currentMedia.thumbnail}
              alt={t('music.albumArtAlt', { title: currentMedia.title })}
            />
          ) : (
            <div className="music-cover-placeholder">
              <Music size={34} strokeWidth={1.7} aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* Right: Header + Lyrics/Title + Scrubber + Transport & Device */}
      <div className="music-right-panel">
        <div
          className="music-track-header-row"
          onClick={currentMedia.hasSession ? onOpenMediaSource : undefined}
          title={currentMedia.hasSession ? t('home.openMediaSource') : undefined}
          style={currentMedia.hasSession ? { cursor: 'pointer' } : undefined}
        >
          <div className="music-track-header" aria-live="polite">
            {showTitleInHeader ? (
              <>
                <span className="music-track-title-inline">{currentMedia.title}</span>
                {subtitleText && (
                  <>
                    <span className="music-track-dot">·</span>
                    <span className="music-track-artist">{subtitleText}</span>
                  </>
                )}
              </>
            ) : currentMedia.hasSession ? (
              <>
                <span className={`music-status-dot ${currentMedia.isPlaying ? 'is-playing' : ''}`} />
                <span>{t('music.nowPlaying')}</span>
                {hasSyncedLyrics && subtitleText && (
                  <>
                    <span className="music-track-dot">·</span>
                    <span className="music-track-artist">{subtitleText}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="music-status-dot" />
                <span className="music-track-title-inline">{t('music.nothingPlaying')}</span>
                <span className="music-track-dot">·</span>
                <span className="music-track-artist">{t('music.playPrompt')}</span>
              </>
            )}
          </div>
          {currentMedia.hasSession && (
            <span
              className={`music-header-eq ${currentMedia.isPlaying ? 'is-playing' : ''}`}
              aria-hidden="true"
            >
              <i /><i /><i /><i />
            </span>
          )}
        </div>

        <div className="music-lyrics-box">
          <p
            key={hasSyncedLyrics ? `active-${activeLyricIndex}` : 'active-static'}
            className={`lyric-line-active ${hasSyncedLyrics ? 'karaoke-active-line' : ''}`}
          >
            {primaryLine}
          </p>
          {secondaryLine && (
            <p
              key={hasSyncedLyrics ? `next-${activeLyricIndex}` : 'next-static'}
              className={`lyric-line-next ${hasSyncedLyrics ? 'karaoke-next-line' : ''}`}
            >
              {secondaryLine}
            </p>
          )}
        </div>

        <MusicScrubber
          currentMedia={currentMedia}
          active={active}
          onSeek={onSeek}
          onInteractionStart={onInteractionStart}
        />

        <div className="music-controls-row">
          {!currentMedia.hasSession && showMusicServicePicker ? (
            <div
              className="music-service-picker-row in-music-tab"
              onPointerDown={() => onInteractionStart?.()}
            >
              <button
                type="button"
                className="music-service-logo-btn spotify-btn"
                onClick={(e) => onLaunchMusicService(e, 'spotify')}
                title={t('home.openSpotify')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11" fill="#1ED760" />
                  <path
                    d="M16.9 10.6C13.9 8.8 8.9 8.6 6.1 9.5C5.6 9.6 5.1 9.4 5 8.9C4.9 8.4 5.1 7.9 5.6 7.8C8.9 6.8 14.4 7 17.9 9.1C18.3 9.3 18.5 9.9 18.2 10.3C18 10.7 17.4 10.9 16.9 10.6ZM16.8 13.5C16.6 13.9 16.1 14 15.7 13.7C13.2 12.2 9.4 11.7 6.5 12.6C6.1 12.7 5.6 12.5 5.5 12.1C5.4 11.7 5.6 11.2 6 11.1C9.4 10.1 13.6 10.6 16.5 12.4C16.9 12.6 17 13.1 16.8 13.5ZM15.5 16.3C15.3 16.6 14.9 16.7 14.6 16.5C12.4 15.2 9.7 14.9 6.6 15.6C6.3 15.7 5.9 15.5 5.8 15.1C5.7 14.8 5.9 14.4 6.3 14.3C9.8 13.5 12.8 13.8 15.3 15.3C15.6 15.5 15.7 16 15.5 16.3Z"
                    fill="#000000"
                  />
                </svg>
                <span>Spotify</span>
              </button>

              <button
                type="button"
                className="music-service-logo-btn ytmusic-btn"
                onClick={(e) => onLaunchMusicService(e, 'ytmusic')}
                title={t('home.openYtMusic')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11" fill="#FF0033" />
                  <circle cx="12" cy="12" r="6.2" stroke="#FFFFFF" strokeWidth="1.4" />
                  <polygon points="10.4,9.3 15.2,12 10.4,14.7" fill="#FFFFFF" />
                </svg>
                <span>YouTube Music</span>
              </button>

              <button
                type="button"
                className="music-picker-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  playRoboSound('tap', soundEffectsEnabled);
                  setShowMusicServicePicker(false);
                }}
                aria-label="Kapat"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="music-transport-center">
              <button
                type="button"
                className="transport-icon-btn"
                onClick={onPrev}
                disabled={!currentMedia.hasSession}
                aria-label={t('music.prevTrack')}
                title={t('music.prevTrack')}
              >
                <SkipBack size={17} fill="currentColor" strokeWidth={1.6} />
              </button>
              <button
                type="button"
                className="transport-play-circle"
                onClick={onPlayPause}
                aria-label={
                  currentMedia.isPlaying
                    ? t('music.pause')
                    : currentMedia.hasSession
                      ? t('music.play')
                      : t('music.pickApp')
                }
                title={
                  currentMedia.isPlaying
                    ? t('music.pause')
                    : currentMedia.hasSession
                      ? t('music.play')
                      : t('music.pickApp')
                }
              >
                {currentMedia.isPlaying ? (
                  <Pause size={18} fill="currentColor" strokeWidth={1.6} />
                ) : (
                  <Play
                    size={18}
                    fill="currentColor"
                    strokeWidth={1.6}
                    style={{ marginLeft: 1.5 }}
                  />
                )}
              </button>
              <button
                type="button"
                className="transport-icon-btn"
                onClick={onNext}
                disabled={!currentMedia.hasSession}
                aria-label={t('music.nextTrack')}
                title={t('music.nextTrack')}
              >
                <SkipForward size={17} fill="currentColor" strokeWidth={1.6} />
              </button>
            </div>
          )}

          <div className="music-device-wrap" ref={deviceWrapRef}>
            {showPlayOnPopover && (
              <div className="play-on-popover" onClick={(e) => e.stopPropagation()}>
                <div className="play-on-header">
                  <strong>{t('music.playOn')}</strong>
                  <button
                    type="button"
                    className="play-on-close"
                    onClick={() => setShowPlayOnPopover(false)}
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="play-on-divider" />
                <div className="play-on-row">
                  <div className="play-on-left">
                    <Laptop size={14} />
                    <span>{t('music.thisPc')}</span>
                  </div>
                  <Check size={14} strokeWidth={2.5} />
                </div>
              </div>
            )}
            <button
              type="button"
              className={`music-device-btn ${showPlayOnPopover ? 'is-open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                playRoboSound('tap', soundEffectsEnabled);
                setShowPlayOnPopover((p) => !p);
              }}
              title={t('music.playOn')}
              aria-label={t('music.playOn')}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
