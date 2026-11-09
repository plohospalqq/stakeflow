import { useEffect, useId, useState } from 'react';
import type { ShelfSummary } from '@/api/types.summary';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useReveal } from '@/hooks/useMotion';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth, formatNumber } from '@/lib/format';

const STEP_MS = 380;

/**
 * Two years of the whole shelf, month by month. A real range input sits over the bars, so
 * click, drag and arrow keys all scrub; Play steps through the months. The field circles
 * stay at the latest month, and the panel says so.
 */
export function ShelfTimeline({
  series,
  className,
}: {
  series: ShelfSummary['series'] | undefined;
  className?: string;
}) {
  const { m, t } = useI18n();
  const id = useId();
  const [ref, reveal] = useReveal<HTMLDivElement>();
  const last = (series?.length ?? 1) - 1;
  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const current = index ?? last;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((i) => {
        const next = (i ?? last) >= last ? 0 : (i ?? last) + 1;
        if (next === last) setPlaying(false);
        return next;
      });
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, last]);

  if (!series || series.length === 0) {
    return (
      <div className={`glass rounded-[24px] p-4 ${className ?? ''}`}>
        <Skeleton height={70} />
      </div>
    );
  }

  const values = series.map((p) => p.boePerDay);
  const max = Math.max(...values);
  const min = Math.min(...values) * 0.82;
  const point = series[current] ?? series[last];
  const value = (p: { boePerDay: number }) => formatNumber(p.boePerDay / 1e6, 2);
  const first = series[0];
  const middle = series[Math.floor(last / 2)];

  return (
    <section
      aria-labelledby={`${id}-h`}
      className={`glass grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-[24px] px-4 py-3.5 sm:grid-cols-[44px_minmax(0,1fr)_150px] ${className ?? ''}`}
    >
      <h2 id={`${id}-h`} className="sr-only">
        {m.map.timeline}
      </h2>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg transition-transform duration-300 hover:scale-105"
        aria-label={playing ? m.map.pause : m.map.play}
        aria-pressed={playing}
        onClick={() => {
          if (!playing && current === last) setIndex(0);
          setPlaying((p) => !p);
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="min-w-0">
        <div ref={ref} data-reveal={reveal} className="relative flex h-[58px] items-end gap-[3px]">
          {series.map((p, i) => (
            <span
              key={p.month}
              aria-hidden="true"
              className="grow-y flex-1 origin-bottom rounded-t-[4px] rounded-b-[2px] transition-colors duration-200"
              style={{
                height: `${Math.max(6, ((p.boePerDay - min) / (max - min || 1)) * 100)}%`,
                background:
                  i === current ? 'var(--tx)' : 'color-mix(in srgb, var(--tx) 22%, transparent)',
                '--i': i,
              }}
            />
          ))}
          {/* The real control: invisible, over the bars, focus shown on the whole strip. */}
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={current}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            aria-label={m.map.timelineLabel}
            aria-valuetext={
              point
                ? t(m.map.timelineValue, { month: formatMonth(point.month), value: value(point) })
                : undefined
            }
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="pointer-events-none absolute -inset-1 rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-muted" aria-hidden="true">
          <span>{first ? formatMonth(first.month) : ''}</span>
          <span className="hidden sm:inline">{middle ? formatMonth(middle.month) : ''}</span>
          <span>{series[last] ? formatMonth(series[last].month) : ''}</span>
        </div>
      </div>
      <div className="col-span-2 flex items-baseline gap-2 sm:col-span-1 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="display num text-[28px] font-bold leading-none tracking-[-0.03em]">
          {point ? `${value(point)} M` : '–'}
        </span>
        <span className="text-[12px] text-muted">
          {point ? formatMonth(point.month) : ''} · {m.map.shelfTotal}
        </span>
      </div>
      <p className="col-span-full m-0 text-[12px] text-muted">{m.map.timelineNote}</p>
    </section>
  );
}
