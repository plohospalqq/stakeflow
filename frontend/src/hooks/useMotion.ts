/**
 * Motion primitives. Every animation here starts from content that is already readable and
 * falls back to the final state at once when motion is reduced, the tab is hidden or the
 * browser lacks the API; nothing ever waits invisibly for a timer or an observer.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useMediaQuery } from './useMediaQuery';

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

/**
 * Counts from `from` to `target` once per target change, like a keynote reveal. The final
 * value is shown immediately with reduced motion or in a hidden tab, and a timer guarantees
 * it even if animation frames never arrive (e.g. a backgrounded or throttled page).
 */
export function useCountUp(target: number, { duration = 1400, from = 0 } = {}): number {
  const reduced = useReducedMotion();
  const animated = !reduced && typeof requestAnimationFrame !== 'undefined' && !document.hidden;
  const [value, setValue] = useState(() => (animated ? from : target));
  // Later changes (unit toggle, new data) glide from what is on screen, not from zero.
  const shown = useRef(value);
  shown.current = value;

  useEffect(() => {
    const origin = shown.current;
    if (!animated || !Number.isFinite(target) || !Number.isFinite(origin)) {
      setValue(target);
      return;
    }
    if (origin === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(origin + (target - origin) * easeOutQuart(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = window.setTimeout(() => setValue(target), duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [target, duration, animated]);

  return value;
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width + r.height > 0;
}

/**
 * Draw-on-view. Returns a ref and a data-reveal value: 'on' once the element is in view,
 * which replays the CSS draw/grow animations. Elements are fully drawn without it, so a
 * missing IntersectionObserver or reduced motion simply shows the finished state.
 */
export function useReveal<T extends Element>(): [RefObject<T>, 'on' | undefined] {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);

  // Layout effect: an element already on screen starts drawing in the first paint, so it
  // never flashes complete-then-empty.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || on) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (inViewport(el)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, on]);

  return [ref, on ? 'on' : undefined];
}
