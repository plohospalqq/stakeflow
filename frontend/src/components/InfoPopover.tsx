import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface InfoPopoverProps {
  /** What the (i) explains, for the button's accessible name. */
  topic: string;
  children: ReactNode;
}

/** Plain-language explainer behind an (i) icon. Esc or a click outside closes it. */
export function InfoPopover({ topic, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={`What is ${topic}?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-ink max-nav:h-8 max-nav:w-8"
      >
        <Icon name="info" size={14} />
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full z-40 mt-1.5 block w-[min(320px,80vw)] rounded-control border border-line-strong bg-surface p-3 text-[13px] font-normal leading-normal text-ink shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
