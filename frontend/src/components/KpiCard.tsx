import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import { CountUp } from './CountUp';
import { DeltaBadge, type DeltaBadgeProps } from './DeltaBadge';
import { SampleBadge } from './SampleBadge';
import { Skeleton } from './Skeleton';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label: ReactNode;
  /** null = loading skeleton. Already in the display unit. */
  value: number | null;
  /** Unit text next to the value, e.g. 'kboe/d'. */
  unit: string;
  format: (value: number) => string;
  delta?: DeltaBadgeProps;
  /** Text next to the delta or below the value, e.g. 'vs Jul' or 'range 429–447'. */
  sub?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  href?: string;
  sample?: boolean;
  /** Smaller value text for dense grids (mobile 2-column KPIs). */
  compact?: boolean;
  /** Corner tag, e.g. a ticker. */
  tag?: string;
  className?: string;
  /** Stagger index for the entrance animation. */
  index?: number;
}

/** A bento widget: label, a big counted-up number, a delta and a sparkline that draws. */
export function KpiCard({
  label,
  value,
  unit,
  format,
  delta,
  sub,
  spark,
  sparkColor,
  href,
  sample,
  compact,
  tag,
  className,
  index = 0,
}: KpiCardProps) {
  const { m, t } = useI18n();
  if (value === null) {
    return (
      <div className={`card flex flex-col gap-3 p-5 ${className ?? ''}`} aria-busy="true">
        <span className="sr-only">
          {typeof label === 'string' ? t(m.common.loadingNamed, { name: label }) : m.common.loading}
        </span>
        <Skeleton width="60%" height={12} />
        <Skeleton width="50%" height={compact ? 26 : 38} />
        <Skeleton width="40%" height={14} />
      </div>
    );
  }

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        {sample ? <SampleBadge /> : null}
        {tag && !sample ? (
          <span className="rounded-lg bg-surface2 px-2 py-0.5 text-[11.5px] font-semibold text-muted">
            {tag}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <CountUp
          value={value}
          format={format}
          className={`display num ${compact ? 'text-kpi-sm' : 'text-[34px] leading-none tracking-[-0.04em] nav:text-kpi'}`}
        />
        <span className="text-[14px] font-semibold text-muted">{unit}</span>
      </span>
      {delta || sub ? (
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          {delta ? <DeltaBadge {...delta} /> : null}
          {sub ? <span>{sub}</span> : null}
        </span>
      ) : null}
      {spark && spark.length > 1 ? (
        <span className="-mx-5 -mb-5 mt-auto block pt-2">
          <Sparkline values={spark} height={48} area color={sparkColor ?? 'var(--fc)'} />
        </span>
      ) : null}
    </>
  );

  const base = `card enter flex min-w-0 flex-col gap-2 overflow-hidden p-5 ${className ?? ''}`;
  return href ? (
    <Link to={href} className={`${base} lift text-ink no-underline`} style={{ '--i': index }}>
      {body}
    </Link>
  ) : (
    <div className={base} style={{ '--i': index }}>
      {body}
    </div>
  );
}
