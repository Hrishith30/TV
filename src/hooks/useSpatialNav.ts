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

function focusElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth') {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
}

/** First thing a remote should land on: real content before chrome. */
function firstTarget(container: HTMLElement) {
  return (
    container.querySelector<HTMLElement>('.grid button, .picker-row') ??
    container.querySelector<HTMLElement>(FOCUSABLE)
  );
}

function scrollableAncestor(from: HTMLElement | null) {
  let node = from?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight - node.clientHeight > 4) return node;
    node = node.parentElement;
  }
  return null;
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

      if (!active || active === document.body || active === document.documentElement) {
        const first = container === document.body
          ? (document.querySelector<HTMLElement>('.grid button, .picker-row') ?? firstTarget(container))
          : firstTarget(container);
        if (first) {
          event.preventDefault();
          focusElement(first, 'auto');
        }
        return;
      }

      const next = findNext(active, direction, container);
      if (next) {
        event.preventDefault();
        focusElement(next);
        return;
      }

      // Sidebar is a dead end for a remote: step into the content instead.
      if (!scope && (direction === 'right' || direction === 'down')) {
        const content = document.querySelector<HTMLElement>('.view');
        if (content && !content.contains(active)) {
          const target = firstTarget(content);
          if (target) {
            event.preventDefault();
            focusElement(target, 'auto');
            return;
          }
        }
      }

      // Nothing ahead spatially, so scroll the list itself. Without this the
      // focus ring parks on the last visible row and the list never moves.
      const scroller = scrollableAncestor(active);
      if (!scroller) return;
      if (direction === 'down' || direction === 'up') {
        const step = scroller.clientHeight * 0.7 * (direction === 'down' ? 1 : -1);
        scroller.scrollBy({ top: step, behavior: 'smooth' });
      } else {
        const step = scroller.clientWidth * 0.7 * (direction === 'right' ? 1 : -1);
        scroller.scrollBy({ left: step, behavior: 'smooth' });
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, root]);
}
