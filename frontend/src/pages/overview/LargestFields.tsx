import { useMemo } from 'react';
import { Link } from 'react-router';
import { useFields } from '@/api/hooks';
import type { FieldSummary } from '@/api/types';
import { DataTable, type Column } from '@/components/DataTable';
import { DeltaBadge } from '@/components/DeltaBadge';
import { ErrorState } from '@/components/ErrorState';
import { OilShareBar } from '@/components/MixBar';
import { SectionHeading } from '@/components/SectionHeading';
import { useUnits, type Units } from '@/hooks/useUnits';
import { addMonths } from '@/lib/dates';
import { formatMonth, formatMonthName } from '@/lib/format';
import { latestView } from '@/lib/latest';

interface Row {
  field: FieldSummary;
  value: number;
  momPct: number | null;
}

function columns(units: Units, prevMonthName: string): Column<Row>[] {
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
      id: 'operator',
      header: 'Operator',
      value: (r) => r.field.operator?.name ?? '',
      cell: (r) => <span className="text-muted">{r.field.operator?.name ?? '–'}</span>,
    },
    {
      id: 'value',
      header: `Production, ${units.label}`,
      headerText: `Production (${units.label})`,
      align: 'right',
      value: (r) => r.value,
      cell: (r) => units.format(r.value),
    },
    {
      id: 'mom',
      header: `vs ${prevMonthName}`,
      align: 'right',
      value: (r) => r.momPct,
      cell: (r) => (r.momPct === null ? '–' : <DeltaBadge value={r.momPct} />),
    },
    {
      id: 'mix',
      header: 'Oil share',
      sortable: false,
      width: 180,
      value: (r) => r.field.latest?.mix.oil ?? null,
      cell: (r) => <OilShareBar oilShare={r.field.latest?.mix.oil ?? 0} />,
    },
  ];
}

export function LargestFields({ limit = 8 }: { limit?: number }) {
  const units = useUnits();
  const fields = useFields('Producing');
  const latestMonth = fields.data?.find((f) => f.latest)?.latest?.month;

  const rows = useMemo(
    () =>
      (fields.data ?? [])
        .filter((f) => f.latest)
        .map((field) => {
          const view = field.latest ? latestView(field.latest, units.unit) : null;
          return { field, value: view?.value ?? 0, momPct: view?.momPct ?? null };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, limit),
    [fields.data, units.unit, limit],
  );
  const cols = useMemo(
    () => columns(units, latestMonth ? formatMonthName(addMonths(latestMonth, -1)) : 'last month'),
    [units, latestMonth],
  );

  if (fields.isError) {
    return (
      <ErrorState message="Fields could not be loaded." onRetry={() => void fields.refetch()} />
    );
  }

  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="fl-h">
      <SectionHeading
        id="fl-h"
        title="Largest fields this month"
        sub={`Gross field production${latestMonth ? `, ${formatMonth(latestMonth)}` : ''} · ${units.label}`}
        actions={
          <Link to="/map" className="btn">
            Open map
          </Link>
        }
      />
      <div className="px-1.5 pb-1.5">
        <DataTable
          caption="Largest producing fields in the latest month"
          columns={cols}
          rows={rows}
          rowKey={(r) => String(r.field.id)}
          loading={fields.isPending}
        />
      </div>
      <div className="lbl border-t border-line px-[18px] pb-3.5 pt-2.5">
        Oil share of the field&apos;s oil equivalent; the rest is gas and NGL/condensate.
      </div>
    </section>
  );
}
