import { formatShare } from '@/lib/format';
import { mixLabel, type Mix } from '@/lib/mix';

interface MixBarProps {
  mix: Mix;
  showLegend?: boolean;
  height?: number;
  /** Only the oil and gas segments (table cells), with oil share as text. */
  compact?: boolean;
  className?: string;
}

/** Product split of a volume. Shares are fractions of oil equivalent and add up to 1. */
export function MixBar({ mix, showLegend = false, height = 6, className }: MixBarProps) {
  const parts = [
    { key: 'oil', label: 'Oil', value: mix.oil, color: 'var(--oil)' },
    { key: 'gas', label: 'Gas', value: mix.gas, color: 'var(--gas)' },
    { key: 'cnd', label: 'NGL + condensate', value: mix.nglCond, color: 'var(--cnd)' },
  ];
  return (
    <div className={`flex flex-col gap-[7px] ${className ?? ''}`}>
      <div
        role="img"
        aria-label={mixLabel(mix)}
        className="flex gap-0.5 overflow-hidden rounded-[3px]"
        style={{ height }}
      >
        {parts.map((p) =>
          p.value > 0.0005 ? (
            <span key={p.key} style={{ width: `${p.value * 100}%`, background: p.color }} />
          ) : null,
        )}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted" aria-hidden="true">
          {parts.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span className="dot" style={{ background: p.color }} />
              {p.label} <span className="num">{formatShare(p.value)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Oil-share bar for table cells: oil vs everything else, with the oil % as text. */
export function OilShareBar({ oilShare, width = 140 }: { oilShare: number; width?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-[3px]"
        style={{ maxWidth: width, minWidth: 60 }}
        aria-hidden="true"
      >
        <span style={{ width: `${oilShare * 100}%`, background: 'var(--oil)' }} />
        <span style={{ width: `${(1 - oilShare) * 100}%`, background: 'var(--gas)' }} />
      </div>
      <span className="num lbl w-11 text-right">{formatShare(oilShare)}</span>
    </div>
  );
}
