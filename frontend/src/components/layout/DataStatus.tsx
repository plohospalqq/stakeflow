import { addDays, addMonths, monthEnd } from '@/lib/dates';
import { formatDate, formatMonth } from '@/lib/format';

/** Sodir field-level data lands 40–69 days after month end (docs/nowcast-feasibility.md). */
const LAG_MIN_DAYS = 40;
const LAG_MAX_DAYS = 69;

export interface DataStatusProps {
  /** Newest month in the data, 'YYYY-MM-01'; undefined while loading. */
  latestMonth: string | undefined;
  error?: boolean;
}

function nextReleaseWindow(latestMonth: string): string {
  const next = addMonths(latestMonth, 1);
  const end = monthEnd(next);
  const from = formatDate(addDays(end, LAG_MIN_DAYS)).replace(/ \d{4}$/, '');
  const to = formatDate(addDays(end, LAG_MAX_DAYS)).replace(/ \d{4}$/, '');
  return `${formatMonth(next)} expected ${from} – ${to}`;
}

export function DataStatusCard({ latestMonth, error }: DataStatusProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-line p-3">
      <span className="cap">Data status</span>
      <span className="flex items-center gap-2 text-[13px]">
        <span
          className="dot rounded-full"
          style={{ background: error ? 'var(--dn)' : latestMonth ? 'var(--up)' : 'var(--fa)' }}
          aria-hidden="true"
        />
        {error
          ? 'Sodir · data unavailable'
          : latestMonth
            ? `Sodir · through ${formatMonth(latestMonth)}`
            : 'Sodir · checking…'}
      </span>
      {latestMonth ? <span className="lbl">{nextReleaseWindow(latestMonth)}.</span> : null}
    </div>
  );
}

export function FreshnessText({ latestMonth, error }: DataStatusProps) {
  if (error) return <>Sodir data unavailable</>;
  if (!latestMonth) return <>Checking data…</>;
  return <>Sodir · through {formatMonth(latestMonth)}</>;
}
