import { useMemo, useState } from 'react';
import type { FieldMonthly } from '@/api/types';
import { DataTable, type Column } from '@/components/DataTable';
import { DeltaBadge } from '@/components/DeltaBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useUnits, type Units } from '@/hooks/useUnits';
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

function columns(units: Units): Column<Row>[] {
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
      header: 'Month',
      value: (r) => r.month,
      cell: (r) => <span className="num">{formatMonth(r.month)}</span>,
    },
    num('oil', 'Oil', 'var(--oil)'),
    num('gas', 'Gas', 'var(--gas)'),
    num('nglCond', 'NGL + cond.', 'var(--cnd)'),
    {
      ...num('total', 'Total'),
      cell: (r) => <strong>{units.format(r.total, units.unit === 'boe' ? 1 : 3)}</strong>,
    },
    {
      id: 'changePct',
      header: 'vs previous',
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
  const cols = useMemo(() => columns(units), [units]);

  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="mt-h">
      <SectionHeading
        id="mt-h"
        title="Monthly data"
        sub={`Last ${span} months · gross field · ${units.label}`}
        actions={
          <>
            <SegmentedControl
              label="Months shown"
              value={span}
              onChange={setSpan}
              options={[
                { value: '6', label: '6 mo' },
                { value: '12', label: '12 mo' },
                { value: '36', label: '36 mo' },
              ]}
            />
            <button
              type="button"
              className="btn"
              onClick={onDownload}
              disabled={history.length === 0}
            >
              Download CSV
            </button>
          </>
        }
      />
      <div className="px-1.5 pb-1.5">
        <DataTable
          caption="Monthly production of the field by product"
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
