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
import { latestView } from '@/lib/latest';

type StatusFilter = 'producing' | 'all';

interface Row {
  field: FieldSummary;
  value: number | null;
  momPct: number | null;
}

function columns(units: Units): Column<Row>[] {
  return [
    {
      id: 'name',
      header: 'Field',
      value: (r) => r.field.name,
      cell: (r) => (
        <Link to={`/fields/${r.field.id}`} className="link font-medium">
          {r.field.name}
        </Link>
      ),
    },
    {
      id: 'area',
      header: 'Area',
      value: (r) => r.field.mainArea,
      cell: (r) => <span className="text-muted">{r.field.mainArea ?? '–'}</span>,
    },
    {
      id: 'operator',
      header: 'Operator',
      value: (r) => r.field.operator?.name ?? null,
      cell: (r) => <span className="text-muted">{r.field.operator?.name ?? '–'}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      value: (r) => r.field.status,
      cell: (r) => <FieldStatusChip status={r.field.status} />,
    },
    {
      id: 'value',
      header: `Latest, ${units.label}`,
      align: 'right',
      value: (r) => r.value,
      cell: (r) => (r.value === null ? '–' : units.format(r.value)),
    },
    {
      id: 'mom',
      header: 'vs previous',
      align: 'right',
      value: (r) => r.momPct,
      cell: (r) => (r.momPct === null ? '–' : <DeltaBadge value={r.momPct} />),
    },
    {
      id: 'oil',
      header: 'Oil share',
      sortable: false,
      value: (r) => r.field.latest?.mix.oil ?? null,
      cell: (r) => (r.field.latest ? <OilShareBar oilShare={r.field.latest.mix.oil} /> : null),
    },
  ];
}

export default function FieldsIndex() {
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
  const cols = useMemo(() => columns(units), [units]);

  return (
    <Page label="Fields" title="Every field on the Norwegian shelf">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'producing', label: 'Producing' },
            { value: 'all', label: 'All fields' },
          ]}
        />
        <label className="input flex w-full items-center gap-2 text-muted sm:w-[280px]">
          <Icon name="search" />
          <span className="sr-only">Find a field</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a field, e.g. Troll"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none"
          />
        </label>
      </div>
      {fields.isError ? (
        <ErrorState message="Fields could not be loaded." onRetry={() => void fields.refetch()} />
      ) : (
        <section className="card min-w-0" aria-label="Fields">
          <DataTable
            caption="Fields on the Norwegian shelf with their latest monthly production"
            columns={cols}
            rows={rows}
            rowKey={(r) => String(r.field.id)}
            initialSort={{ id: 'value', desc: true }}
            loading={fields.isPending}
            empty={query ? `No field matches “${query}”.` : 'No fields.'}
          />
        </section>
      )}
      <p className="lbl m-0">
        {rows.length} fields · gross field production, latest month · {units.longLabel}
      </p>
    </Page>
  );
}
