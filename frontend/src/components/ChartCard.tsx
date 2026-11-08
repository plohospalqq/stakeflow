import { useId, useState, type ReactNode } from 'react';
import { InfoPopover } from './InfoPopover';
import { SampleBadge } from './SampleBadge';
import { Skeleton } from './Skeleton';

export interface LegendItem {
  label: string;
  /** CSS colour, usually a token: 'var(--oil)'. */
  color: string;
  /** How the key is drawn: filled square (areas, bars), line, dashed line or band. */
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
      return <span className="w-3.5 border-t-2" style={{ borderColor: item.color }} />;
    case 'dashed':
      return (
        <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: item.color }} />
      );
    case 'band':
      return (
        <span
          className="h-2 w-3.5"
          style={{ background: `color-mix(in srgb, ${item.color} 22%, transparent)` }}
        />
      );
    case 'dot':
      return <span className="dot rounded-full" style={{ background: item.color }} />;
    default:
      return <span className="dot" style={{ background: item.color }} />;
  }
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 text-[12px] text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendKey item={item} />
          {item.label}
          {item.value ? <span className="num text-ink">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

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
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();
  const Heading = headingLevel;

  let body: ReactNode;
  if (state === 'loading') {
    body = (
      <div className="px-4 py-2" style={{ height }} aria-busy="true">
        <span className="sr-only">Loading chart</span>
        <Skeleton height="100%" />
      </div>
    );
  } else if (state === 'empty' || state === 'error') {
    body = (
      <div
        className="flex flex-col items-center justify-center gap-3 px-4 text-center text-[13px] text-muted"
        style={{ height }}
        role={state === 'error' ? 'alert' : undefined}
      >
        <span>
          {message ??
            (state === 'error' ? 'This chart could not be loaded.' : 'No data for this selection.')}
        </span>
        {state === 'error' && onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    body = showTable && table ? <div className="px-2 pb-2">{table}</div> : children;
  }

  return (
    <section
      className={`card flex min-w-0 flex-col ${className ?? ''}`}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5 px-4 pb-1.5 pt-3.5">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-1.5">
            <Heading id={headingId} className="m-0 text-h2">
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 pb-3 pt-2.5 text-[12px] text-muted">
        {/* A chart with its own legend inside the body (e.g. a value list) passes [] here. */}
        {legend.length > 0 ? <Legend items={legend} /> : <span aria-hidden="true" />}
        <span className="flex flex-wrap items-center gap-3">
          {table && state === 'ready' ? (
            <button
              type="button"
              className="min-h-[32px] rounded-md px-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink"
              aria-pressed={showTable}
              onClick={() => setShowTable((s) => !s)}
            >
              {showTable ? 'Show chart' : 'Show as table'}
            </button>
          ) : null}
          <span>
            Source: {source.label}
            {source.asOf ? ` · ${source.asOf}` : ''}
          </span>
        </span>
      </div>
    </section>
  );
}
