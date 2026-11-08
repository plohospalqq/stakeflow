import { useMemo } from 'react';
import type { Prediction } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { EChart } from '@/components/charts/EChart';
import { buildAccuracyOption, TARGET_ERROR_PCT } from '@/components/charts/accuracyOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { formatPct, formatQuarter } from '@/lib/format';
import { accuracyByQuarter } from '@/lib/trackRecord';

export function AccuracyCard({
  predictions,
  state,
  onRetry,
}: {
  predictions: Prediction[];
  state: ChartState;
  onRetry: () => void;
}) {
  const t = useChartTheme();
  const isDesktop = useIsDesktop();
  const points = useMemo(
    () =>
      accuracyByQuarter(predictions).map((q) => ({
        label: formatQuarter(q.quarterStart).replace(/ 20(\d\d)$/, ' $1'),
        quarterName: formatQuarter(q.quarterStart),
        model: q.model,
        baseline: q.baseline,
      })),
    [predictions],
  );
  const option = useMemo(() => buildAccuracyOption(t, points, !isDesktop), [t, points, isDesktop]);
  const onTarget = points.filter((p) => p.model < TARGET_ERROR_PCT).length;
  const height = isDesktop ? 220 : 200;

  return (
    <ChartCard
      title="Accuracy over time"
      subtitle="Average error per quarter, % · lower is better"
      info="For each quarter: how far the frozen forecasts landed from what the companies reported, ignoring direction, next to the same number for the simple guess (last quarter's figure, unchanged). The dashed line is the 2% target."
      sample="Sample predictions until the nowcast model is in the backend"
      legend={[
        { label: 'Our model', color: 'var(--fc)' },
        { label: 'Simple guess', color: 'var(--f4)' },
        { label: `${TARGET_ERROR_PCT}% target`, color: 'var(--up)', kind: 'dashed' },
      ]}
      source={{ label: 'Sample data' }}
      state={state === 'ready' && points.length === 0 ? 'empty' : state}
      message="No resolved predictions for this selection yet."
      onRetry={onRetry}
      height={height}
      table={
        <DataTable
          caption="Average error per quarter, model vs simple guess (sample data)"
          dense
          rows={[...points].reverse()}
          rowKey={(p) => p.quarterName}
          columns={[
            { id: 'q', header: 'Quarter', value: (p) => p.quarterName },
            {
              id: 'model',
              header: 'Our model',
              align: 'right',
              value: (p) => p.model,
              cell: (p) => formatPct(p.model),
            },
            {
              id: 'baseline',
              header: 'Simple guess',
              align: 'right',
              value: (p) => p.baseline,
              cell: (p) => formatPct(p.baseline),
            },
          ]}
        />
      }
    >
      <div className="px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={`Average error per quarter over ${points.length} quarters (sample data): the model was under the ${TARGET_ERROR_PCT}% target in ${onTarget} of them and below the simple guess in ${
            points.filter((p) => p.model < p.baseline).length
          }.`}
        />
      </div>
    </ChartCard>
  );
}
