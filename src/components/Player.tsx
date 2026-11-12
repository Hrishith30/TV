import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { PlayItem } from '../types';
import { Icon } from './Icon';
import { formatTime } from '../utils';

type PlayerProps = {
  items: PlayItem[];
  startIndex: number;
  onClose: () => void;
};

export function Player({ items, startIndex, onClose }: PlayerProps) {
  const [index, setIndex] = useState(startIndex);
  const current = items[Math.min(index, items.length - 1)] ?? items[0];

  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const retries = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controls, setControls] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  const bump = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3500);
  }, []);

  const close = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    bump();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [bump, playing, current.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;

    let hls: Hls | null = null;
    let disposed = false;
    retries.current = 0;
    setError(null);
    setBuffering(true);
    setNeedsTap(false);
    setTime(0);
    setDuration(0);

    const startPlayback = () => {
      const attemptPlay = video.play();
      if (attemptPlay) attemptPlay.catch(() => setNeedsTap(true));
    };

    if (current.hls) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
        });
        hls.loadSource(current.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!disposed) startPlayback();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed || !hls) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retries.current < 2) {
            retries.current += 1;
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries.current < 2) {
            retries.current += 1;
            hls.recoverMediaError();
            return;
          }
          setError('This stream could not be played. It may be offline or blocked by your network.');
          setBuffering(false);
          hls.destroy();
          hls = null;
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = current.url;
        startPlayback();
      } else {
        setError('This device does not support HLS playback.');
        setBuffering(false);
      }
    } else {
      video.src = current.url;
      startPlayback();
    }

    return () => {
      disposed = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [current, attempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  // Endless spinner is useless: say what is likely wrong after a few seconds.
  useEffect(() => {
    if (!buffering || error) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [buffering, error, current.url]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setNeedsTap(false);
      const attemptPlay = video.play();
      if (attemptPlay) attemptPlay.catch(() => setNeedsTap(true));
    } else {
      video.pause();
    }
  }, []);

  const step = useCallback(
    (direction: number) => {
      if (items.length < 2) return;
      setIndex((value) => (value + direction + items.length) % items.length);
    },
    [items.length],
  );

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (shell.requestFullscreen) {
      void shell.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const onControl = target instanceof Element && Boolean(target.closest('input, button, select, textarea'));

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (onControl) return;

      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (current.live) step(1);
          else if (videoRef.current) videoRef.current.currentTime = Math.min(duration || 0, videoRef.current.currentTime + 10);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (current.live) step(-1);
          else if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setVolume((value) => Math.min(1, Number((value + 0.1).toFixed(2))));
          setMuted(false);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setVolume((value) => Math.max(0, Number((value - 0.1).toFixed(2))));
          break;
        case 'm':
        case 'M':
          setMuted((value) => !value);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
      bump();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bump, close, current.live, duration, step, toggleFullscreen, togglePlay]);

  if (!current) return null;

  return (
    <div className="player" ref={shellRef} onMouseMove={bump} onTouchStart={bump}>
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        onPlay={() => {
          setPlaying(true);
          setBuffering(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onError={() => {
          if (!current.hls) {
            setError('This video could not be played. The format may not be supported on this device.');
            setBuffering(false);
          }
        }}
      />

      {needsTap && !error && (
        <button type="button" className="player-tap" onClick={togglePlay} aria-label="Play">
          <span>
            <Icon name="play" size={34} />
          </span>
        </button>
      )}

      {buffering && !error && <div className="player-spinner" aria-label="Buffering" />}

      {slow && buffering && !error && (
        <div className="player-stall">
          <h3>Still buffering…</h3>
          <p>
            The stream is not arriving fast enough. This usually means the channel is heavy for your connection
            (4K/HD channels need a lot of bandwidth), the channel is offline, or another device is already using your
            single allowed connection.
          </p>
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSlow(false);
                setAttempt((value) => value + 1);
              }}
            >
              <Icon name="retry" size={18} /> Reload stream
            </button>
            <button type="button" className="btn btn-ghost" onClick={close}>
              Pick another channel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="player-error">
          <h3>Playback problem</h3>
          <p>{error}</p>
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              <Icon name="retry" size={18} /> Try again
            </button>
            <button type="button" className="btn btn-ghost" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className={`player-ui${controls ? ' is-visible' : ''}`}>
        <div className="player-top">
          <button type="button" className="icon-btn" onClick={close} aria-label="Close player">
            <Icon name="close" />
          </button>
          <div className="player-title">
            <h2>{current.title}</h2>
            {current.subtitle && <p>{current.subtitle}</p>}
          </div>
          <div className="spacer" />
          {current.live && <span className="live-badge">LIVE</span>}
        </div>

        <div className="player-bottom">
          {!current.live && (
            <input
              className="seek"
              type="range"
              min={0}
              max={Number.isFinite(duration) ? duration : 0}
              step={0.5}
              value={time}
              aria-label="Seek"
              onChange={(event) => {
                const video = videoRef.current;
                if (video) video.currentTime = Number(event.target.value);
              }}
            />
          )}

          <div className="player-controls">
            <button
              type="button"
              className="control-btn is-primary"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={22} />
            </button>

            <button
              type="button"
              className="control-btn"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              <Icon name={muted || volume === 0 ? 'mute' : 'volume'} />
            </button>

            <input
              className="vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(event) => {
                setVolume(Number(event.target.value));
                setMuted(Number(event.target.value) === 0);
              }}
            />

            <span className="time-label">
              {current.live ? 'Live stream' : `${formatTime(time)} / ${formatTime(duration)}`}
            </span>

            <div className="spacer" />

            {items.length > 1 && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => step(-1)}>
                  <Icon name="chevronLeft" size={16} /> Prev
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => step(1)}>
                  Next <Icon name="chevronRight" size={16} />
                </button>
              </>
            )}

            <button type="button" className="control-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
              <Icon name="fullscreen" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
