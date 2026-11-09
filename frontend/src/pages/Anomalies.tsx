import { useMemo, useState } from 'react';
import { useAnomalies, useFreshness } from '@/api/hooks';
import type { AnomalyStatus } from '@/api/types';
import { ErrorState } from '@/components/ErrorState';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Skeleton } from '@/components/Skeleton';
import { useI18n } from '@/i18n/useI18n';
import { sortAnomalies } from '@/lib/anomalies';
import { addMonths } from '@/lib/dates';
import { formatMonth } from '@/lib/format';
import { AnomalyItem } from './anomalies/AnomalyItem';

type Filter = 'all' | AnomalyStatus;

const FILTERS: Filter[] = ['all', 'new', 'investigating', 'explained', 'resolved'];

/** Changes a reader makes here. Kept in memory only until anomalies have a backend. */
interface LocalEdits {
  status?: AnomalyStatus;
  notes: string[];
}

export default function Anomalies() {
  const { m, t } = useI18n();
  const anomalies = useAnomalies();
  const freshness = useFreshness();
  const [filter, setFilter] = useState<Filter>('all');
  const [edits, setEdits] = useState<Record<string, LocalEdits>>({});

  const items = useMemo(
    () =>
      sortAnomalies(anomalies.data ?? []).map((a) => ({
        anomaly: a,
        status: edits[a.id]?.status ?? a.status,
        notes: edits[a.id]?.notes ?? [],
      })),
    [anomalies.data, edits],
  );

  const latest = freshness.data?.latestMonth;
  const counts = [
    {
      label: m.anomalies.open,
      n: items.filter((i) => i.status === 'new' || i.status === 'investigating').length,
    },
    { label: m.anomalies.high, n: items.filter((i) => i.anomaly.severity === 'high').length },
    {
      label: latest
        ? t(m.anomalies.inMonth, { month: formatMonth(latest) })
        : m.anomalies.latestMonth,
      n: latest ? items.filter((i) => i.anomaly.month === latest).length : 0,
    },
    {
      label: m.anomalies.last12,
      n: latest ? items.filter((i) => i.anomaly.month > addMonths(latest, -12)).length : 0,
    },
  ];
  const options = FILTERS.map((value) => ({
    value,
    label: value === 'all' ? m.anomalies.all : m.anomalies.status[value],
    count: value === 'all' ? items.length : items.filter((i) => i.status === value).length,
  }));
  const shown = items.filter((i) => filter === 'all' || i.status === filter);

  const edit = (id: string, change: (e: LocalEdits) => LocalEdits) =>
    setEdits((all) => ({ ...all, [id]: change(all[id] ?? { notes: [] }) }));

  return (
    <Page label={m.anomalies.label} title={m.anomalies.title}>
      <section
        className="card enter flex flex-wrap items-center gap-x-8 gap-y-4 p-5"
        aria-labelledby="what-h"
      >
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="what-h" className="display m-0 text-h2 font-semibold">
              {m.anomalies.whatTitle}
            </h2>
            <SampleBadge detail={m.sample.anomalies} />
          </div>
          <p className="m-0 text-[14px] text-muted">{m.anomalies.whatText}</p>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:gap-7">
          {counts.map((c) => (
            <div key={c.label} className="flex flex-col-reverse">
              <dt className="lbl">{c.label}</dt>
              <dd className="display num m-0 text-[30px] font-bold tracking-[-0.03em]">
                {anomalies.isPending ? '–' : c.n}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label={m.anomalies.filter}
          value={filter}
          onChange={setFilter}
          options={options}
        />
        <span className="lbl">{m.anomalies.order}</span>
      </div>

      <section aria-labelledby="feed-h" className="flex flex-col gap-3">
        <h2 id="feed-h" className="sr-only">
          {m.anomalies.feed}
        </h2>
        {anomalies.isError ? (
          <ErrorState message={m.anomalies.failed} onRetry={() => void anomalies.refetch()} />
        ) : anomalies.isPending ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="card flex flex-col gap-2 p-[18px]" aria-busy="true">
              <Skeleton width="30%" />
              <Skeleton width="50%" height={18} />
              <Skeleton height={60} />
            </div>
          ))
        ) : shown.length === 0 ? (
          <p className="card m-0 px-5 py-8 text-center text-[14px] text-muted">
            {m.anomalies.none}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {shown.map((i) => (
              <AnomalyItem
                key={i.anomaly.id}
                anomaly={i.anomaly}
                status={i.status}
                notes={i.notes}
                onMarkExplained={() => edit(i.anomaly.id, (e) => ({ ...e, status: 'explained' }))}
                onAddNote={(note) =>
                  edit(i.anomaly.id, (e) => ({ ...e, notes: [...e.notes, note] }))
                }
              />
            ))}
          </ul>
        )}
        <p className="lbl m-0">{m.anomalies.foot}</p>
      </section>
    </Page>
  );
}
