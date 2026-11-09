import { Link } from 'react-router';
import { useAnomalies } from '@/api/hooks';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { useI18n } from '@/i18n/useI18n';
import { sortAnomalies } from '@/lib/anomalies';
import { formatMonth, formatPct } from '@/lib/format';

export function RecentAnomalies({ limit = 4 }: { limit?: number }) {
  const { m } = useI18n();
  const anomalies = useAnomalies();
  const items = sortAnomalies(anomalies.data ?? []).slice(0, limit);
  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="an-h">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-5">
        <span className="flex flex-wrap items-center gap-2">
          <h3 id="an-h" className="display m-0 text-h2 font-semibold">
            {m.anomalies.recent}
          </h3>
          <SampleBadge detail={m.sample.anomalies} />
        </span>
        <Link to="/anomalies" className="text-[14px] font-medium text-muted hover:text-ink">
          {m.anomalies.viewAll}
        </Link>
      </div>
      <ul className="m-0 list-none px-2 pb-2">
        {anomalies.isPending
          ? [0, 1, 2].map((i) => (
              <li key={i} className="px-3 py-3">
                <Skeleton height={14} />
              </li>
            ))
          : items.map((a) => {
              const color = a.pctVsExpected < 0 ? 'var(--dn)' : 'var(--up)';
              return (
                <li
                  key={a.id}
                  className="flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[14px] font-semibold">
                      <Link to={`/fields/${a.fieldId}`} className="link">
                        {a.fieldName}
                      </Link>{' '}
                      <span
                        className="num"
                        style={{ color: a.pctVsExpected < 0 ? 'var(--dn-ink)' : 'var(--up-ink)' }}
                      >
                        {formatPct(a.pctVsExpected, 0, true)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                      <SeverityChip severity={a.severity} />
                      <StatusChip status={a.status} /> {formatMonth(a.month)}
                    </span>
                  </span>
                  <span className="w-16 flex-none">
                    <Sparkline
                      values={a.series.map((s) => s.actual)}
                      height={26}
                      strokeWidth={1.6}
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
