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
import type { Dict } from '@/i18n/types';
import { useI18n } from '@/i18n/useI18n';
import { addMonths } from '@/lib/dates';
import { formatMonth, formatMonthName } from '@/lib/format';
import { latestView } from '@/lib/latest';

interface Row {
  field: FieldSummary;
  value: number;
  momPct: number | null;
}

function columns(units: Units, m: Dict, vsLabel: string): Column<Row>[] {
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
      id: 'operator',
      header: m.common.operator,
      value: (r) => r.field.operator?.name ?? '',
      cell: (r) => <span className="text-muted">{r.field.operator?.name ?? '–'}</span>,
    },
    {
      id: 'value',
      header: units.label,
      align: 'right',
      value: (r) => r.value,
      cell: (r) => units.format(r.value),
    },
    {
      id: 'mom',
      header: vsLabel,
      align: 'right',
      value: (r) => r.momPct,
      cell: (r) => (r.momPct === null ? '–' : <DeltaBadge value={r.momPct} />),
    },
    {
      id: 'mix',
      header: m.fields.colOil,
      sortable: false,
      width: 180,
      value: (r) => r.field.latest?.mix.oil ?? null,
      cell: (r) => <OilShareBar oilShare={r.field.latest?.mix.oil ?? 0} />,
    },
  ];
}

export function LargestFields({ limit = 8 }: { limit?: number }) {
  const { m, t } = useI18n();
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
    () =>
      columns(
        units,
        m,
        latestMonth
          ? t(m.common.vsMonth, { month: formatMonthName(addMonths(latestMonth, -1)) })
          : m.common.vsPrevious,
      ),
    [units, m, t, latestMonth],
  );

  if (fields.isError) {
    return <ErrorState message={m.fields.loadFailed} onRetry={() => void fields.refetch()} />;
  }

  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="fl-h">
      <SectionHeading
        id="fl-h"
        title={m.fields.largestTitle}
        sub={t(m.fields.largestSub, {
          month: latestMonth ? formatMonth(latestMonth) : '…',
          unit: units.label,
        })}
        actions={
          <Link to="/fields" className="btn">
            {m.nav.fields}
          </Link>
        }
      />
      <div className="px-2 pb-2">
        <DataTable
          caption={m.fields.largestTitle}
          columns={cols}
          rows={rows}
          rowKey={(r) => String(r.field.id)}
          loading={fields.isPending}
        />
      </div>
      <p className="lbl m-0 px-5 pb-4">{m.fields.oilShareNote}</p>
    </section>
  );
}
