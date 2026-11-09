import { useMemo } from 'react';
import type { Prediction } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { ErrorChip } from '@/components/Chips';
import { DataTable } from '@/components/DataTable';
import { EChart } from '@/components/charts/EChart';
import { buildNowcastOption, type NowcastPoint } from '@/components/charts/quarterOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { formatQuarter, formatQuarterShort } from '@/lib/format';
import { errorPct } from '@/lib/trackRecord';

const SHOWN = 8;

/** Sample data end to end: the nowcast model is not in the backend yet. */
export function NowcastCard({
  companyName,
  predictions,
  state,
  onRetry,
}: {
  companyName: string;
  predictions: Prediction[];
  state: ChartState;
  onRetry: () => void;
}) {
  const units = useUnits();
  const { m, t: tr } = useI18n();
  const t = useChartTheme();
  const isDesktop = useIsDesktop();
  const digits = units.unit === 'boe' ? 1 : 3;

  const points = useMemo<NowcastPoint[]>(() => {
    // Latest row per quarter: revisions are new rows, the newest one counts.
    const byQuarter = new Map<string, Prediction>();
    for (const p of [...predictions].sort((a, b) => a.madeAt.localeCompare(b.madeAt))) {
      byQuarter.set(p.quarterStart, p);
    }
    return [...byQuarter.values()]
      .sort((a, b) => a.quarterStart.localeCompare(b.quarterStart))
      .slice(-SHOWN)
      .map((p) => {
        const conv = (v: number) => units.fromQuarterRate(v, p.quarterStart);
        return {
          label: formatQuarterShort(p.quarterStart),
          quarterName: formatQuarter(p.quarterStart),
          predicted: conv(p.predicted),
          lo: conv(p.lo),
          hi: conv(p.hi),
          actual: p.actual === null ? null : conv(p.actual),
          errorPct: p.actual === null ? null : errorPct(p.predicted, p.actual),
        };
      });
  }, [predictions, units]);

  const option = useMemo(
    () =>
      buildNowcastOption(t, points, {
        compact: !isDesktop,
        format: (v) => units.format(v, digits),
        unitLabel: units.label,
        m,
      }),
    [t, points, isDesktop, units, digits, m],
  );
  const height = isDesktop ? 250 : 210;
  const open = points.find((p) => p.actual === null);

  return (
    <ChartCard
      className="min-w-0 flex-[3_1_560px]"
      title={m.nowcastCard.title}
      subtitle={tr(m.nowcastCard.sub, { unit: units.label })}
      info={m.nowcastCard.info}
      sample={m.sample.nowcastAll}
      legend={[
        { label: m.nowcastCard.legendReported, color: 'var(--f4)' },
        { label: m.nowcastCard.legendNowcast, color: 'var(--fc)', kind: 'line' },
        { label: m.nowcastCard.legendOpen, color: 'var(--fc)', kind: 'dashed' },
      ]}
      source={{ label: m.common.sampleSource }}
      state={state === 'ready' && points.length === 0 ? 'empty' : state}
      message={tr(m.nowcastCard.notNowcast, { company: companyName })}
      onRetry={onRetry}
      height={height}
      table={
        <DataTable
          caption={tr(m.nowcastCard.tableCaption, { company: companyName })}
          dense
          rows={[...points].reverse()}
          rowKey={(p) => p.quarterName}
          columns={[
            { id: 'q', header: m.common.quarter, value: (p) => p.quarterName },
            {
              id: 'pred',
              header: m.nowcastCard.colNowcast,
              align: 'right',
              value: (p) => p.predicted,
              cell: (p) => units.format(p.predicted, digits),
            },
            {
              id: 'range',
              header: m.nowcastCard.colRange,
              align: 'right',
              value: (p) => p.lo,
              cell: (p) => `${units.format(p.lo, digits)}–${units.format(p.hi, digits)}`,
            },
            {
              id: 'actual',
              header: m.nowcastCard.colReported,
              align: 'right',
              value: (p) => p.actual,
              cell: (p) =>
                p.actual === null ? m.nowcastCard.open : units.format(p.actual, digits),
            },
            {
              id: 'err',
              header: m.nowcastCard.colError,
              align: 'right',
              value: (p) => p.errorPct,
              cell: (p) => (p.errorPct === null ? '–' : <ErrorChip value={p.errorPct} />),
            },
          ]}
        />
      }
    >
      <div className="px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={`${tr(m.nowcastCard.aria, { company: companyName, n: points.length })}${
            open
              ? tr(m.nowcastCard.ariaOpen, {
                  quarter: open.quarterName,
                  value: units.format(open.predicted),
                  unit: units.label,
                })
              : ''
          }`}
        />
      </div>
    </ChartCard>
  );
}
