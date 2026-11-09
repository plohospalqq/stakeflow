import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Width of an element in CSS pixels, kept current with ResizeObserver. Small SVGs draw in
 * real pixels with it, so strokes keep their width without vector-effect tricks.
 */
export function useElementWidth<T extends Element>(fallback = 300): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
