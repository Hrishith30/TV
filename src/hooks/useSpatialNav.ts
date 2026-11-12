import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function middle(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findNext(current: HTMLElement, direction: Direction, scope: HTMLElement) {
  const from = current.getBoundingClientRect();
  const origin = middle(from);
  let best: { element: HTMLElement; score: number } | null = null;

  const candidates = scope.querySelectorAll<HTMLElement>(FOCUSABLE);
  for (const element of candidates) {
    if (element === current || element.offsetParent === null) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;

    const point = middle(box);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    let advance: number;
    let drift: number;
    if (direction === 'right') {
      advance = dx;
      drift = Math.abs(dy);
    } else if (direction === 'left') {
      advance = -dx;
      drift = Math.abs(dy);
    } else if (direction === 'down') {
      advance = dy;
      drift = Math.abs(dx);
    } else {
      advance = -dy;
      drift = Math.abs(dx);
    }

    if (advance < 6) continue;
    // Keep movement inside the current row/column so grids feel predictable.
    const tolerance = Math.max(from.height, box.height) * 1.35 + 24;
    if (drift > tolerance) continue;

    const score = advance + drift * 2.5;
    if (!best || score < best.score) best = { element, score };
  }

  return best?.element ?? null;
}

/**
 * D-pad / keyboard navigation for TVs. A scoped instance (root provided) only
 * acts while focus lives inside its container, so overlays own their own keys.
 */
export function useSpatialNav(enabled = true, root?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const direction = DIRECTION_KEYS[event.key];
      if (!direction) return;

      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [data-nonav]')) return;

      // A scoped overlay is open: let its own handler deal with the press.
      if (!root && document.querySelector('.overlay')) return;

      const active = document.activeElement as HTMLElement | null;
      const scope = root?.current;
      if (root && (!scope || !active || !scope.contains(active))) return;

      const container = scope ?? document.body;

      if (!active || active === document.body) {
        const first = container.querySelector<HTMLElement>(FOCUSABLE);
        if (first) {
          event.preventDefault();
          first.focus({ preventScroll: true });
          first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        return;
      }

      const next = findNext(active, direction, container);
      if (!next) return;

      event.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, root]);
}
