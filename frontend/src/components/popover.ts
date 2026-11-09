import { useEffect, useRef } from 'react';

/** Hook shared by the (i) popover and glossary terms: Esc or a click outside closes. */
export function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);
  return { root, button };
}

export const POPOVER_CLASS =
  'glass absolute top-full z-40 mt-2 block w-[min(320px,80vw)] rounded-[18px] p-3.5 text-left text-[14px] font-normal normal-case leading-normal tracking-normal text-ink';
