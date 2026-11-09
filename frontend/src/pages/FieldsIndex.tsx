import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useFields } from '@/api/hooks';
import type { FieldSummary } from '@/api/types';
import { FieldStatusChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { DeltaBadge } from '@/components/DeltaBadge';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { Page } from '@/components/layout/Page';
import { OilShareBar } from '@/components/MixBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useUnits, type Units } from '@/hooks/useUnits';
import type { Dict } from '@/i18n/types';
import { fill } from '@/i18n/text';
import { useI18n } from '@/i18n/useI18n';
import { latestView } from '@/lib/latest';

type StatusFilter = 'producing' | 'all';

interface Row {
  field: FieldSummary;
  value: number | null;
  momPct: number | null;
}

function columns(units: Units, m: Dict): Column<Row>[] {
  return [
    {
      id: 'name',
      header: m.common.field,
      value: (r) => r.field.name,
      cell: (r) => (
        <Link to={`/fields/${r.field.id}`} className="link font-semibold">
          {r.field.name}
        </Link>
      ),
    },
    {
      id: 'area',
      header: m.fields.colArea,
      value: (r) => r.field.mainArea,
      cell: (r) => <span className="text-muted">{r.field.mainArea ?? '–'}</span>,
    },
    {
      id: 'operator',
      header: m.common.operator,
      value: (r) => r.field.operator?.name ?? null,
      cell: (r) => <span className="text-muted">{r.field.operator?.name ?? '–'}</span>,
    },
    {
      id: 'status',
      header: m.fields.colStatus,
      value: (r) => r.field.status,
      cell: (r) => <FieldStatusChip status={r.field.status} />,
    },
    {
      id: 'value',
      header: fill(m.fields.colLatest, { unit: units.label }),
      align: 'right',
      value: (r) => r.value,
      cell: (r) => (r.value === null ? '–' : units.format(r.value)),
    },
    {
      id: 'mom',
      header: m.common.vsPrevious,
      align: 'right',
      value: (r) => r.momPct,
      cell: (r) => (r.momPct === null ? '–' : <DeltaBadge value={r.momPct} />),
    },
    {
      id: 'oil',
      header: m.fields.colOil,
      sortable: false,
      value: (r) => r.field.latest?.mix.oil ?? null,
      cell: (r) => (r.field.latest ? <OilShareBar oilShare={r.field.latest.mix.oil} /> : null),
    },
  ];
}

export default function FieldsIndex() {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const [status, setStatus] = useState<StatusFilter>('producing');
  const [query, setQuery] = useState('');
  const fields = useFields();

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('nb-NO');
    return (fields.data ?? [])
      .filter((f) => status === 'all' || f.status === 'Producing')
      .filter((f) => !q || f.name.toLocaleLowerCase('nb-NO').includes(q))
      .map((field) => {
        const view = field.latest ? latestView(field.latest, units.unit) : null;
        return { field, value: view?.value ?? null, momPct: view?.momPct ?? null };
      });
  }, [fields.data, status, query, units.unit]);
  const cols = useMemo(() => columns(units, m), [units, m]);

  return (
    <Page label={m.page.fields} title={m.fields.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label={m.fields.statusFilter}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'producing', label: m.fields.producing },
            { value: 'all', label: m.fields.allFields },
          ]}
        />
        <label className="input flex w-full items-center gap-2 text-muted max-nav:min-h-[44px] sm:w-[300px]">
          <Icon name="search" />
          <span className="sr-only">{m.fields.find}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.fields.findPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none"
          />
        </label>
      </div>
      {fields.isError ? (
        <ErrorState message={m.fields.loadFailed} onRetry={() => void fields.refetch()} />
      ) : (
        <section className="card enter min-w-0 px-2 py-2" aria-label={m.page.fields}>
          <DataTable
            caption={m.fields.caption}
            columns={cols}
            rows={rows}
            rowKey={(r) => String(r.field.id)}
            initialSort={{ id: 'value', desc: true }}
            loading={fields.isPending}
            empty={query ? t(m.fields.noMatch, { q: query }) : m.fields.none}
          />
        </section>
      )}
      <p className="lbl m-0">
        {t(m.fields.count, { fields: plural(m.common.fields, rows.length), unit: units.longLabel })}
      </p>
    </Page>
  );
}
