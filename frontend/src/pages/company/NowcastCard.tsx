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
import { formatQuarter } from '@/lib/format';
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
          label: formatQuarter(p.quarterStart).replace(/ 20(\d\d)$/, ' $1'),
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
      }),
    [t, points, isDesktop, units, digits],
  );
  const height = isDesktop ? 250 : 210;
  const open = points.find((p) => p.actual === null);

  return (
    <ChartCard
      className="min-w-0 flex-[3_1_560px]"
      title="Nowcast vs reported, by quarter"
      subtitle={`Average daily production · ${units.label}`}
      info="Each quarter the model forecasts the company's production. The forecast is frozen at quarter end and scored when the company publishes its trading update. Bars are the reported figure, the bright tick is the frozen forecast, and the number above each bar is the error. The dashed bar is the quarter still open, with its 80% range."
      sample="The nowcast model is not in the backend yet; every number in this chart is sample data"
      legend={[
        { label: 'Reported (sample)', color: 'var(--f4)' },
        { label: 'Nowcast, frozen at quarter end', color: 'var(--fc)', kind: 'line' },
        { label: 'Open quarter with 80% range', color: 'var(--fc)', kind: 'dashed' },
      ]}
      source={{ label: 'Sample data' }}
      state={state === 'ready' && points.length === 0 ? 'empty' : state}
      message={`${companyName} is not nowcast. Only Aker BP, Vår Energi and Equinor (NCS only) are modelled.`}
      onRetry={onRetry}
      height={height}
      table={
        <DataTable
          caption={`${companyName}: sample nowcasts and reported production by quarter`}
          dense
          rows={[...points].reverse()}
          rowKey={(p) => p.quarterName}
          columns={[
            { id: 'q', header: 'Quarter', value: (p) => p.quarterName },
            {
              id: 'pred',
              header: 'Nowcast',
              align: 'right',
              value: (p) => p.predicted,
              cell: (p) => units.format(p.predicted, digits),
            },
            {
              id: 'range',
              header: '80% range',
              align: 'right',
              value: (p) => p.lo,
              cell: (p) => `${units.format(p.lo, digits)}–${units.format(p.hi, digits)}`,
            },
            {
              id: 'actual',
              header: 'Reported',
              align: 'right',
              value: (p) => p.actual,
              cell: (p) => (p.actual === null ? 'Open' : units.format(p.actual, digits)),
            },
            {
              id: 'err',
              header: 'Error',
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
          ariaLabel={`Sample nowcasts for ${companyName} against reported production over ${points.length} quarters${
            open
              ? `; open quarter ${open.quarterName} at ${units.format(open.predicted)} ${units.label}`
              : ''
          }`}
        />
      </div>
    </ChartCard>
  );
}
