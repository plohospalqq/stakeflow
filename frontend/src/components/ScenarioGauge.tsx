import { useI18n } from '@/i18n/useI18n';
import { formatPct } from '@/lib/format';
import { CountUp } from './CountUp';

interface ScenarioGaugeProps {
  medianPct: number;
  lowPct: number;
  highPct: number;
  size?: 'md' | 'lg';
}

/**
 * The modelled change as one big signed number over its 80% range: a band with the median
 * marked and zero shown, so "could go either way" is visible at a glance.
 */
export function ScenarioGauge({ medianPct, lowPct, highPct, size = 'lg' }: ScenarioGaugeProps) {
  const { m, t } = useI18n();
  const span = Math.max(Math.abs(lowPct), Math.abs(highPct), 5) * 1.15;
  const pos = (v: number) => `${((v + span) / (2 * span)) * 100}%`;
  const color =
    medianPct < -0.05 ? 'var(--dn-ink)' : medianPct > 0.05 ? 'var(--up-ink)' : 'var(--tx)';
  const tint = medianPct < 0 ? 'var(--dn)' : 'var(--up)';
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <span className="sr-only">
        {t(m.scenarios.resultSr, {
          median: formatPct(medianPct, 1, true),
          lo: formatPct(lowPct, 0, true),
          hi: formatPct(highPct, 0, true),
        })}
      </span>
      <span
        aria-hidden="true"
        className={`display num font-extrabold leading-none tracking-[-0.05em] ${size === 'lg' ? 'text-[clamp(64px,8vw,96px)]' : 'text-[56px]'}`}
        style={{ color }}
      >
        <CountUp value={medianPct} format={(v) => formatPct(v, 0, true)} duration={900} />
      </span>
      <div className="relative mt-2 h-2.5 w-full max-w-[340px]" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--tx)_8%,transparent)]" />
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-500"
          style={{
            left: pos(lowPct),
            width: `calc(${pos(highPct)} - ${pos(lowPct)})`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${tint} 18%, transparent), color-mix(in srgb, ${tint} 60%, transparent), color-mix(in srgb, ${tint} 18%, transparent))`,
          }}
        />
        <div className="absolute -top-1 h-[18px] w-px bg-muted" style={{ left: pos(0) }} />
        <div
          className="absolute -top-1.5 h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-ink transition-all duration-500"
          style={{ left: pos(medianPct) }}
        />
      </div>
      <span aria-hidden="true" className="text-[14px] text-muted">
        {t(m.scenarios.range, { lo: formatPct(lowPct, 0, true), hi: formatPct(highPct, 0, true) })}
      </span>
    </div>
  );
}
