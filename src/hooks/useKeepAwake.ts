import { useEffect } from 'react';

type KeepAwakeOptions = {
  /** Start the muted fallback clip when no real video is on screen. */
  fallback?: boolean;
};

/**
 * Keeps the display awake with no input from the viewer. Fire TV sleeps on its
 * own idle timer, which a page cannot reset by pretending to be active, so the
 * only two levers are a screen wake lock and actual media playback.
 *
 * The wake lock is held the whole time the app is visible. On firmwares that
 * grant a lock but still sleep, a 1x1 transparent muted clip plays as well;
 * that clip is paused while the player is open, because the stream being
 * watched already keeps the device awake and nothing should compete with it.
 */
export function useKeepAwake({ fallback = true }: KeepAwakeOptions = {}) {
  // Screen wake lock for as long as the app is on screen.
  useEffect(() => {
    let disposed = false;
    let sentinel: { release: () => Promise<void> } | null = null;

    const wakeLock =
      'wakeLock' in navigator
        ? (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<unknown> } }).wakeLock
        : undefined;

    const acquire = async () => {
      if (disposed || !wakeLock || document.visibilityState !== 'visible') return;
      try {
        const lock = (await wakeLock.request('screen')) as {
          release: () => Promise<void>;
          addEventListener: (type: 'release', listener: () => void) => void;
        };
        sentinel = lock;
        // The system drops the lock whenever the page is hidden, so ask again
        // as soon as the app comes back to the foreground.
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
          void acquire();
        });
      } catch {
        /* refused or unsupported; the fallback effect covers those devices */
      }
    };

    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  // Silent clip: stays out of the way, but keeps stubborn firmwares awake.
  useEffect(() => {
    if (!fallback) return;

    let video: HTMLVideoElement | null = null;
    let timer: number | null = null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream?.(1);
      if (context && stream) {
        video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('aria-hidden', 'true');
        video.srcObject = stream;
        video.style.cssText =
          'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(video);
        void video.play().catch(() => undefined);

        let light = false;
        timer = window.setInterval(() => {
          light = !light;
          context.fillStyle = light ? '#000' : '#010101';
          context.fillRect(0, 0, 2, 2);
        }, 1000);
      }
    } catch {
      /* nothing else to try on this device */
    }

    return () => {
      if (timer !== null) window.clearInterval(timer);
      if (video) {
        video.pause();
        video.remove();
      }
    };
  }, [fallback]);
}
