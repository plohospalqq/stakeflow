import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';
import { POPOVER_CLASS, useDismiss } from './popover';

interface InfoPopoverProps {
  /** What the (i) explains, for the button's accessible name. */
  topic: string;
  children: ReactNode;
  /** Which edge the popover aligns to; right avoids overflow for buttons near the right. */
  align?: 'left' | 'right';
}

/** Plain-language explainer behind an (i) icon. */
export function InfoPopover({ topic, children, align = 'left' }: InfoPopoverProps) {
  const { m, t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const { root, button } = useDismiss(open, () => setOpen(false));

  return (
    <span ref={root} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={t(m.common.whatIs, { topic })}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-ink max-nav:h-11 max-nav:w-11"
      >
        <Icon name="info" size={15} />
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className={`${POPOVER_CLASS} ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
