import { useMemo } from 'react';
import { Link } from 'react-router';
import { USE_MOCKS } from '@/api/mode';
import type { CompanyFieldMonthly } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { DataTable, type Column } from '@/components/DataTable';
import { EChart } from '@/components/charts/EChart';
import { buildFieldStackOption, fieldColor } from '@/components/charts/fieldStackOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { useUnits } from '@/hooks/useUnits';
import { stackFields, type FieldStack } from '@/lib/fieldStack';
import { formatMonth, formatShare } from '@/lib/format';

interface FieldStackCardProps {
  companyName: string;
  rows: CompanyFieldMonthly[] | undefined;
  months: string[];
  state: ChartState;
  onRetry: () => void;
}

function StackTable({ stack, digits }: { stack: FieldStack; digits: number }) {
  const units = useUnits();
  const { m, t } = useI18n();
  const columns: Column<number>[] = [
    {
      id: 'month',
      header: m.common.month,
      value: (i) => stack.months[i] ?? '',
      cell: (i) => <span className="num">{formatMonth(stack.months[i] ?? '')}</span>,
    },
    ...stack.layers.map((layer): Column<number> => ({
      id: layer.key,
      header: layer.name,
      align: 'right',
      value: (i) => layer.values[i] ?? 0,
      cell: (i) => units.format(layer.values[i] ?? 0, digits),
    })),
    {
      id: 'total',
      header: m.common.total,
      align: 'right',
      value: (i) => stack.totals[i] ?? 0,
      cell: (i) => <strong>{units.format(stack.totals[i] ?? 0, digits)}</strong>,
    },
  ];
  return (
    <DataTable
      caption={t(m.company.byFieldTable, { unit: units.label })}
      columns={columns}
      rows={stack.months.map((_, i) => i).reverse()}
      rowKey={(i) => String(i)}
      dense
      maxHeight={320}
    />
  );
}

export function FieldStackCard({ companyName, rows, months, state, onRetry }: FieldStackCardProps) {
  const units = useUnits();
  const { m, t: tr } = useI18n();
  const t = useChartTheme();
  const isDesktop = useIsDesktop();
  const digits = units.unit === 'boe' ? 1 : 3;
  const stack = useMemo(
    () => stackFields(rows ?? [], months, units.fromMonth),
    [rows, months, units.fromMonth],
  );
  const option = useMemo(
    () =>
      buildFieldStackOption(t, stack, {
        compact: !isDesktop,
        format: (v) => units.format(v, digits),
        unitLabel: units.label,
        m,
      }),
    [t, stack, isDesktop, units, digits, m],
  );
  const latestMonth = months[months.length - 1];
  const latestTotal = stack.totals[stack.totals.length - 1] ?? 0;
  const top = stack.layers[0];
  const height = isDesktop ? 280 : 220;
  const empty = state === 'ready' && stack.layers.length === 0;

  return (
    <ChartCard
      title={m.company.byField}
      subtitle={tr(m.company.byFieldSub, {
        company: companyName,
        unit: units.label,
        n: months.length,
      })}
      info={m.company.byFieldInfo}
      legend={[]}
      source={{
        label: USE_MOCKS ? m.common.sampleSource : m.company.sourceLicences,
        asOf: latestMonth
          ? tr(m.common.throughMonth, { month: formatMonth(latestMonth) })
          : undefined,
      }}
      state={empty ? 'empty' : state}
      message={tr(m.company.byFieldEmpty, { company: companyName, n: months.length })}
      onRetry={onRetry}
      height={height}
      table={<StackTable stack={stack} digits={digits} />}
    >
      <div className="flex flex-wrap gap-5 px-2 pb-3 pt-1 nav:px-5">
        <div className="min-w-0 flex-[3_1_520px]">
          <EChart
            option={option}
            height={height}
            ariaLabel={`${tr(m.company.byFieldAria, { company: companyName, n: months.length })}${
              latestMonth
                ? tr(m.company.byFieldAriaLatest, {
                    value: units.format(latestTotal),
                    unit: units.label,
                    month: formatMonth(latestMonth),
                  })
                : ''
            }${top ? tr(m.company.byFieldAriaTop, { field: top.name, share: formatShare(top.share) }) : ''}`}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col px-2 nav:px-0">
          <div className="cap flex justify-between pb-1.5">
            <span>{latestMonth ? formatMonth(latestMonth) : m.company.latest}</span>
            <span>{m.common.share}</span>
          </div>
          <ul className="m-0 list-none p-0" aria-label={m.company.byFieldList}>
            {stack.layers.map((layer, i) => (
              <li
                key={layer.key}
                className="flex items-center gap-2.5 border-t border-line py-2 text-[14px]"
              >
                <span
                  className="dot h-2.5 w-2.5"
                  style={{ background: fieldColor(t, i) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  {layer.fieldId !== null ? (
                    <Link to={`/fields/${layer.fieldId}`} className="link">
                      {layer.name}
                    </Link>
                  ) : (
                    layer.name
                  )}
                </span>
                <span className="num">{units.format(layer.latest, digits)}</span>
                <span className="num lbl w-11 text-right">{formatShare(layer.share)}</span>
              </li>
            ))}
            <li className="flex items-center gap-2.5 border-t border-line-strong py-2 text-[14px] font-semibold">
              <span className="w-2.5" aria-hidden="true" />
              <span className="flex-1">{m.common.total}</span>
              <span className="num">{units.format(latestTotal, digits)}</span>
              <span className="w-11" aria-hidden="true" />
            </li>
          </ul>
        </div>
      </div>
    </ChartCard>
  );
}
