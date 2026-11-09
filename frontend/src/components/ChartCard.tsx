import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { InfoPopover } from './InfoPopover';
import { SampleBadge } from './SampleBadge';
import { Skeleton } from './Skeleton';

export interface LegendItem {
  label: string;
  /** CSS colour, usually a token: 'var(--oil)'. */
  color: string;
  /** How the key is drawn: filled dot (areas, bars), line, dashed line or band. */
  kind?: 'square' | 'line' | 'dashed' | 'band' | 'dot';
  /** Optional value after the label, e.g. latest volume or share. */
  value?: string;
}

export type ChartState = 'ready' | 'loading' | 'empty' | 'error';

interface ChartCardProps {
  title: string;
  /** Always carries the unit, e.g. 'Monthly · kboe/d'. */
  subtitle: string;
  info?: ReactNode;
  actions?: ReactNode;
  legend: LegendItem[];
  source: { label: string; asOf?: string };
  state?: ChartState;
  /** Shown instead of the chart when state is 'empty' or 'error'. */
  message?: string;
  onRetry?: () => void;
  /** Mark the card as (partly) sample data. */
  sample?: boolean | string;
  /** Accessible table alternative, toggled from the card footer. */
  table?: ReactNode;
  /** Height reserved while loading, so the page does not jump. */
  height?: number;
  children: ReactNode;
  className?: string;
  headingLevel?: 'h2' | 'h3';
}

function LegendKey({ item }: { item: LegendItem }) {
  switch (item.kind) {
    case 'line':
      return <span className="w-4 rounded border-t-[2.5px]" style={{ borderColor: item.color }} />;
    case 'dashed':
      return <span className="w-4 border-t-2 border-dashed" style={{ borderColor: item.color }} />;
    case 'band':
      return (
        <span
          className="h-2.5 w-4 rounded-[3px]"
          style={{ background: `color-mix(in srgb, ${item.color} 22%, transparent)` }}
        />
      );
    default:
      return <span className="dot" style={{ background: item.color }} />;
  }
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendKey item={item} />
          {item.label}
          {item.value ? <span className="num font-semibold text-ink">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** A bento tile around a chart: title, unit, (i) explainer, legend, source and a table view. */
export function ChartCard({
  title,
  subtitle,
  info,
  actions,
  legend,
  source,
  state = 'ready',
  message,
  onRetry,
  sample,
  table,
  height = 280,
  children,
  className,
  headingLevel = 'h2',
}: ChartCardProps) {
  const { m, t } = useI18n();
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();
  const Heading = headingLevel;

  let body: ReactNode;
  if (state === 'loading') {
    body = (
      <div className="px-5 py-2" style={{ height }} aria-busy="true">
        <span className="sr-only">{m.common.loadingChart}</span>
        <Skeleton height="100%" />
      </div>
    );
  } else if (state === 'empty' || state === 'error') {
    body = (
      <div
        className="flex flex-col items-center justify-center gap-3 px-5 text-center text-[14px] text-muted"
        style={{ height }}
        role={state === 'error' ? 'alert' : undefined}
      >
        <span>{message ?? (state === 'error' ? m.common.chartFailed : m.common.noData)}</span>
        {state === 'error' && onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            {m.common.tryAgain}
          </button>
        ) : null}
      </div>
    );
  } else {
    body = showTable && table ? <div className="px-3 pb-2">{table}</div> : children;
  }

  return (
    <section
      className={`card enter flex min-w-0 flex-col ${className ?? ''}`}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Heading id={headingId} className="display m-0 text-h2 font-semibold">
              {title}
            </Heading>
            {info ? <InfoPopover topic={title.toLowerCase()}>{info}</InfoPopover> : null}
            {sample ? (
              <SampleBadge detail={typeof sample === 'string' ? sample : undefined} />
            ) : null}
          </div>
          <span className="lbl">{subtitle}</span>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="min-w-0 flex-1">{body}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-4 pt-3 text-[12.5px] text-muted">
        {/* A chart with its own legend inside the body (e.g. a value list) passes [] here. */}
        {legend.length > 0 ? <Legend items={legend} /> : <span aria-hidden="true" />}
        <span className="flex flex-wrap items-center gap-3">
          {table && state === 'ready' ? (
            <button
              type="button"
              className="min-h-[32px] rounded-full bg-surface2 px-3 text-[12.5px] font-medium text-ink hover:bg-surface3 max-nav:min-h-[44px]"
              aria-pressed={showTable}
              onClick={() => setShowTable((s) => !s)}
            >
              {showTable ? m.common.showChart : m.common.showTable}
            </button>
          ) : null}
          <span>
            {t(m.common.source, { source: source.label })}
            {source.asOf ? ` · ${source.asOf}` : ''}
          </span>
        </span>
      </div>
    </section>
  );
}
