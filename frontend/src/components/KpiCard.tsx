import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DeltaBadge, type DeltaBadgeProps } from './DeltaBadge';
import { SampleBadge } from './SampleBadge';
import { Skeleton } from './Skeleton';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label: string;
  /** null = loading skeleton. Already in the display unit. */
  value: number | null;
  /** Unit text next to the value, e.g. 'kboe/d'. */
  unit: string;
  format: (value: number) => string;
  delta?: DeltaBadgeProps;
  /** Text next to the delta or below the value, e.g. 'vs Jul' or 'range 429–447'. */
  sub?: ReactNode;
  spark?: number[];
  href?: string;
  sample?: boolean;
  /** Smaller value text for dense grids (mobile 2-column KPIs). */
  compact?: boolean;
}

export function KpiCard({
  label,
  value,
  unit,
  format,
  delta,
  sub,
  spark,
  href,
  sample,
  compact,
}: KpiCardProps) {
  if (value === null) {
    return (
      <div className="card flex flex-col gap-2.5 px-4 py-3.5" aria-busy="true">
        <span className="sr-only">Loading {label}</span>
        <Skeleton width="70%" height={10} />
        <Skeleton width="50%" height={22} />
        <Skeleton width="40%" height={14} />
      </div>
    );
  }

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="lbl">{label}</span>
        {sample ? <SampleBadge /> : null}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={`num font-semibold tracking-[-0.02em] ${compact ? 'text-[20px]' : 'text-[24px] nav:text-kpi'}`}
        >
          {format(value)}
        </span>
        <span className="lbl">{unit}</span>
      </span>
      {delta || sub ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {delta ? <DeltaBadge {...delta} /> : null}
          {sub ? <span className="lbl">{sub}</span> : null}
        </span>
      ) : null}
      {spark && spark.length > 1 ? <Sparkline values={spark} height={28} area /> : null}
    </>
  );

  const className = 'card flex min-w-0 flex-col gap-1.5 px-4 py-3.5';
  return href ? (
    <Link to={href} className={`${className} text-ink no-underline hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
