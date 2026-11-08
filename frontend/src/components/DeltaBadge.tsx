import { formatNumber, formatPct } from '@/lib/format';

export interface DeltaBadgeProps {
  /** Change in percent for 'pct' (2.1 = +2.1%), or an absolute change for 'abs'. */
  value: number;
  format?: 'pct' | 'abs';
  /** Which direction is good news. Production: up. Errors: down. */
  goodWhen?: 'up' | 'down';
  /** Changes smaller than this (in the value's own unit) render as flat. */
  flatBelow?: number;
  size?: 'sm' | 'lg';
  digits?: number;
  /** Appended after an absolute value, e.g. ' kboe/d'. */
  suffix?: string;
}

type Tone = 'good' | 'bad' | 'flat';

const TONE_CLASS: Record<Tone, string> = {
  good: 'text-up bg-[color-mix(in_srgb,var(--up)_14%,transparent)]',
  bad: 'text-down bg-[color-mix(in_srgb,var(--dn)_14%,transparent)]',
  flat: 'text-muted bg-surface2',
};

/** Arrow + sign + colour: direction is never carried by colour alone. */
export function DeltaBadge({
  value,
  format = 'pct',
  goodWhen = 'up',
  flatBelow = 0.05,
  size = 'sm',
  digits = 1,
  suffix = '',
}: DeltaBadgeProps) {
  const flat = Math.abs(value) < flatBelow;
  const rising = value > 0;
  const tone: Tone = flat ? 'flat' : rising === (goodWhen === 'up') ? 'good' : 'bad';
  const text =
    format === 'pct'
      ? formatPct(flat ? 0 : value, digits, true)
      : `${value > 0 ? '+' : ''}${formatNumber(flat ? 0 : value, digits)}${suffix}`;

  return (
    <span
      className={`num inline-flex items-center gap-[3px] whitespace-nowrap rounded-full font-semibold ${
        size === 'lg' ? 'py-1 pl-2 pr-2.5 text-[14px]' : 'py-0.5 pl-[5px] pr-[7px] text-[12px]'
      } ${TONE_CLASS[tone]}`}
    >
      {flat ? null : (
        <svg
          viewBox="0 0 10 10"
          width="10"
          height="10"
          aria-hidden="true"
          className={rising ? '' : 'rotate-180'}
          fill="currentColor"
        >
          <path d="M5 1.5 9 7.5H1z" />
        </svg>
      )}
      {text}
    </span>
  );
}
