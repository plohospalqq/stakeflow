import { useMemo, useState } from 'react';
import type { FieldMonthly } from '@/api/types';
import { DataTable, type Column } from '@/components/DataTable';
import { DeltaBadge } from '@/components/DeltaBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useUnits, type Units } from '@/hooks/useUnits';
import type { Dict } from '@/i18n/types';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth } from '@/lib/format';

interface Row {
  month: string;
  oil: number;
  gas: number;
  nglCond: number;
  total: number;
  changePct: number | null;
}

type Span = '6' | '12' | '36';

function columns(units: Units, m: Dict): Column<Row>[] {
  const num = (id: keyof Row, label: string, color?: string): Column<Row> => ({
    id,
    header: color ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="dot" style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
    ) : (
      label
    ),
    headerText: label,
    align: 'right',
    value: (r) => r[id],
    cell: (r) => {
      const v = r[id];
      return typeof v === 'number' ? units.format(v, units.unit === 'boe' ? 1 : 3) : v;
    },
  });
  return [
    {
      id: 'month',
      header: m.common.month,
      value: (r) => r.month,
      cell: (r) => <span className="num">{formatMonth(r.month)}</span>,
    },
    num('oil', m.products.oil, 'var(--oil)'),
    num('gas', m.products.gas, 'var(--gas)'),
    num('nglCond', m.products.nglCondShort, 'var(--cnd)'),
    {
      ...num('total', m.common.total),
      cell: (r) => <strong>{units.format(r.total, units.unit === 'boe' ? 1 : 3)}</strong>,
    },
    {
      id: 'changePct',
      header: m.common.vsPrevious,
      align: 'right',
      value: (r) => r.changePct,
      cell: (r) => (r.changePct === null ? '–' : <DeltaBadge value={r.changePct} />),
    },
  ];
}

export function MonthlyTable({
  history,
  loading,
  onDownload,
}: {
  history: FieldMonthly[];
  loading: boolean;
  onDownload: () => void;
}) {
  const units = useUnits();
  const { m, t } = useI18n();
  const [span, setSpan] = useState<Span>('6');
  const rows = useMemo(() => {
    const all = history.map((h) => ({
      month: h.month,
      oil: units.fromMonth(h.oilSm3, h.month),
      gas: units.fromMonth(h.gasOeSm3, h.month),
      nglCond: units.fromMonth(h.nglCondSm3, h.month),
      total: units.fromMonth(h.oeSm3, h.month),
    }));
    return all
      .map((r, i) => {
        const prev = all[i - 1];
        return {
          ...r,
          changePct: prev && prev.total > 0 ? (r.total / prev.total - 1) * 100 : null,
        };
      })
      .slice(-Number(span))
      .reverse();
  }, [history, units, span]);
  const cols = useMemo(() => columns(units, m), [units, m]);

  return (
    <section className="card enter flex min-w-0 flex-col" aria-labelledby="mt-h">
      <SectionHeading
        id="mt-h"
        title={m.field.monthlyTitle}
        sub={t(m.field.monthlySub, { n: span, unit: units.label })}
        actions={
          <>
            <SegmentedControl
              size="sm"
              label={m.field.monthsShown}
              value={span}
              onChange={setSpan}
              options={[
                { value: '6', label: t(m.field.monthsOption, { n: 6 }) },
                { value: '12', label: t(m.field.monthsOption, { n: 12 }) },
                { value: '36', label: t(m.field.monthsOption, { n: 36 }) },
              ]}
            />
            <button
              type="button"
              className="btn"
              onClick={onDownload}
              disabled={history.length === 0}
            >
              {m.common.downloadCsv}
            </button>
          </>
        }
      />
      <div className="px-2 pb-2">
        <DataTable
          caption={m.field.monthlyCaption}
          columns={cols}
          rows={rows}
          rowKey={(r) => r.month}
          loading={loading}
          dense
          maxHeight={span === '36' ? 480 : undefined}
        />
      </div>
    </section>
  );
}
