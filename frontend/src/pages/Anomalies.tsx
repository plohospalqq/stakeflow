import { useMemo, useState } from 'react';
import { useAnomalies, useFreshness } from '@/api/hooks';
import type { AnomalyStatus } from '@/api/types';
import { ErrorState } from '@/components/ErrorState';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Skeleton } from '@/components/Skeleton';
import { sortAnomalies } from '@/lib/anomalies';
import { addMonths } from '@/lib/dates';
import { formatMonth } from '@/lib/format';
import { AnomalyItem } from './anomalies/AnomalyItem';

type Filter = 'all' | AnomalyStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'explained', label: 'Explained' },
  { value: 'resolved', label: 'Resolved' },
];

/** Changes a reader makes here. Kept in memory only until anomalies have a backend. */
interface LocalEdits {
  status?: AnomalyStatus;
  notes: string[];
}

export default function Anomalies() {
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
      label: 'Open',
      n: items.filter((i) => i.status === 'new' || i.status === 'investigating').length,
    },
    { label: 'High severity', n: items.filter((i) => i.anomaly.severity === 'high').length },
    {
      label: latest ? `In ${formatMonth(latest)}` : 'Latest month',
      n: latest ? items.filter((i) => i.anomaly.month === latest).length : 0,
    },
    {
      label: 'Last 12 months',
      n: latest ? items.filter((i) => i.anomaly.month > addMonths(latest, -12)).length : 0,
    },
  ];
  const options = FILTERS.map((f) => ({
    ...f,
    count: f.value === 'all' ? items.length : items.filter((i) => i.status === f.value).length,
  }));
  const shown = items.filter((i) => filter === 'all' || i.status === filter);

  const edit = (id: string, change: (e: LocalEdits) => LocalEdits) =>
    setEdits((all) => ({ ...all, [id]: change(all[id] ?? { notes: [] }) }));

  return (
    <Page label="Anomalies" title="Unexpected drops and spikes">
      <section
        className="card flex flex-wrap items-center gap-x-7 gap-y-3.5 px-[18px] py-3.5"
        aria-labelledby="what-h"
      >
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="what-h" className="m-0 text-[14px] font-semibold">
              What counts as an anomaly?
            </h2>
            <SampleBadge detail="Anomaly detection is not in the backend yet; the feed is sample data" />
          </div>
          <p className="m-0 text-[13px] text-muted">
            Each month every field&apos;s output is compared with what its forecast expected. If the
            real number lands outside the expected band, more than 10% and more than 3 standard
            deviations away, it shows up here. Many have an ordinary reason, such as planned
            maintenance.
          </p>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:gap-6">
          {counts.map((c) => (
            <div key={c.label} className="flex flex-col-reverse">
              <dt className="lbl">{c.label}</dt>
              <dd className="num m-0 text-[20px] font-semibold">
                {anomalies.isPending ? '–' : c.n}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={options}
        />
        <span className="lbl">Most severe first, then newest</span>
      </div>

      <section aria-labelledby="feed-h" className="flex flex-col gap-3">
        <h2 id="feed-h" className="sr-only">
          Anomaly feed
        </h2>
        {anomalies.isError ? (
          <ErrorState
            message="Anomalies could not be loaded."
            onRetry={() => void anomalies.refetch()}
          />
        ) : anomalies.isPending ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="card flex flex-col gap-2 p-[18px]" aria-busy="true">
              <Skeleton width="30%" />
              <Skeleton width="50%" height={18} />
              <Skeleton height={60} />
            </div>
          ))
        ) : shown.length === 0 ? (
          <p className="card m-0 px-[18px] py-6 text-center text-[13px] text-muted">
            No anomalies with this status.
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
        <p className="lbl m-0">
          Notes and status changes stay in this browser tab until anomalies have a backend. Field
          names and owners are real; the anomaly numbers are sample data.
        </p>
      </section>
    </Page>
  );
}
