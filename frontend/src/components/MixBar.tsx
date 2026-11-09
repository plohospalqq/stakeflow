import { useI18n } from '@/i18n/useI18n';
import { formatShare } from '@/lib/format';
import type { Mix } from '@/lib/mix';

interface MixBarProps {
  mix: Mix;
  showLegend?: boolean;
  height?: number;
  className?: string;
}

/** Product split of a volume. Shares are fractions of oil equivalent and add up to 1. */
export function MixBar({ mix, showLegend = false, height = 8, className }: MixBarProps) {
  const { m, t } = useI18n();
  const parts = [
    { key: 'oil', label: m.products.oil, value: mix.oil, color: 'var(--oil)' },
    { key: 'gas', label: m.products.gas, value: mix.gas, color: 'var(--gas)' },
    { key: 'cnd', label: m.products.nglCond, value: mix.nglCond, color: 'var(--cnd)' },
  ];
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div
        role="img"
        aria-label={t(m.products.mixLabel, {
          oil: formatShare(mix.oil),
          gas: formatShare(mix.gas),
          ngl: formatShare(mix.nglCond),
        })}
        className="flex gap-[3px] overflow-hidden rounded-full"
        style={{ height }}
      >
        {parts.map((p) =>
          p.value > 0.0005 ? (
            <span
              key={p.key}
              className="rounded-full"
              style={{ width: `${p.value * 100}%`, background: p.color }}
            />
          ) : null,
        )}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-hidden="true">
          {parts.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span className="dot" style={{ background: p.color }} />
              {p.label} <span className="num font-semibold text-ink">{formatShare(p.value)}</span>
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
        className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full"
        style={{ maxWidth: width, minWidth: 60 }}
        aria-hidden="true"
      >
        <span
          className="rounded-full"
          style={{ width: `${oilShare * 100}%`, background: 'var(--oil)' }}
        />
        <span
          className="rounded-full"
          style={{ width: `${(1 - oilShare) * 100}%`, background: 'var(--gas)' }}
        />
      </div>
      <span className="num lbl w-11 text-right">{formatShare(oilShare)}</span>
    </div>
  );
}
