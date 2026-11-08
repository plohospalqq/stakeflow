import { Link } from 'react-router';
import { useAnomalies } from '@/api/hooks';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { sortAnomalies } from '@/lib/anomalies';
import { formatMonth, formatPct } from '@/lib/format';

export function RecentAnomalies({ limit = 4 }: { limit?: number }) {
  const anomalies = useAnomalies();
  const items = sortAnomalies(anomalies.data ?? []).slice(0, limit);
  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="an-h">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <span className="flex items-center gap-2">
          <h2 id="an-h" className="m-0 text-h2">
            Recent anomalies
          </h2>
          <SampleBadge detail="Anomaly detection is not in the backend yet" />
        </span>
        <Link to="/anomalies" className="text-[13px] text-muted underline-offset-2 hover:underline">
          View all
        </Link>
      </div>
      <ul className="m-0 list-none p-0">
        {anomalies.isPending
          ? [0, 1, 2].map((i) => (
              <li key={i} className="border-t border-line px-4 py-3">
                <Skeleton height={14} />
              </li>
            ))
          : items.map((a) => {
              const color = a.pctVsExpected < 0 ? 'var(--dn)' : 'var(--up)';
              return (
                <li
                  key={a.id}
                  className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2.5"
                >
                  <SeverityChip severity={a.severity} className="w-[66px] justify-center" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-medium">
                      <Link to={`/fields/${a.fieldId}`} className="link">
                        {a.fieldName}
                      </Link>{' '}
                      <span className="num" style={{ color }}>
                        {formatPct(a.pctVsExpected, 0, true)}
                      </span>
                    </span>
                    <span className="lbl flex flex-wrap items-center gap-1.5">
                      <StatusChip status={a.status} /> {formatMonth(a.month)}
                    </span>
                  </span>
                  <span className="w-16 flex-none">
                    <Sparkline
                      values={a.series.map((s) => s.actual)}
                      height={24}
                      strokeWidth={1.4}
                      color="var(--fa)"
                      tailColor={color}
                    />
                  </span>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
