import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import type { Dict } from '@/i18n/types';
import { POPOVER_CLASS, useDismiss } from './popover';

export type GlossaryKey = keyof Dict['glossary'];

interface TermProps {
  id: GlossaryKey;
  /** The visible text; defaults to the glossary term itself. */
  children?: ReactNode;
}

/**
 * A word with a definition behind it: dotted underline, opens a small glass card. Works in
 * both modes, so experts can still check what a term means here exactly.
 */
export function Term({ id, children }: TermProps) {
  const { m } = useI18n();
  const entry = m.glossary[id];
  const [open, setOpen] = useState(false);
  const popId = useId();
  const { root, button } = useDismiss(open, () => setOpen(false));

  return (
    <span ref={root} className="relative inline">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((o) => !o)}
        className="inline cursor-help rounded-sm p-0 text-left underline decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-solid"
        style={{ font: 'inherit', color: 'inherit', background: 'none' }}
      >
        {children ?? entry.term}
      </button>
      {open ? (
        <span id={popId} role="note" className={`${POPOVER_CLASS} left-0`}>
          <strong className="mb-1 block font-semibold first-letter:uppercase">{entry.term}</strong>
          {entry.def}
        </span>
      ) : null}
    </span>
  );
}
