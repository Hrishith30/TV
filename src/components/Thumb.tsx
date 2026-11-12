import { useEffect, useState } from 'react';
import { cx } from '../utils';

type ThumbProps = {
  src?: string;
  name: string;
  variant?: 'poster' | 'wide';
  className?: string;
};

/** Artwork tile that degrades to initials when a logo is missing or blocked. */
export function Thumb({ src, name, variant = 'poster', className }: ThumbProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = name
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className={cx('thumb', `thumb-${variant}`, className)}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-fallback">{label || '•'}</span>
      )}
    </div>
  );
}
