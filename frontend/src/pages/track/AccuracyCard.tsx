import { useMemo } from 'react';
import { isSample } from '@/api/mode';
import type { Prediction, PredictionKind } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { EChart } from '@/components/charts/EChart';
import { buildAccuracyOption, TARGET_ERROR_PCT } from '@/components/charts/accuracyOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { formatPct, formatQuarter, formatQuarterShort } from '@/lib/format';
import { accuracyByQuarter } from '@/lib/trackRecord';

/** Average error per quarter for one kind of prediction (live and backtests are never pooled). */
export function AccuracyCard({
  kind,
  predictions,
  state,
  onRetry,
}: {
  kind: PredictionKind;
  predictions: Prediction[];
  state: ChartState;
  onRetry: () => void;
}) {
  const t = useChartTheme();
  const { m, t: tr } = useI18n();
  const isDesktop = useIsDesktop();
  const sample = isSample('predictions');
  const points = useMemo(
    () =>
      accuracyByQuarter(predictions.filter((p) => p.kind === kind)).map((q) => ({
        label: formatQuarterShort(q.quarterStart),
        quarterName: formatQuarter(q.quarterStart),
        model: q.model,
        baseline: q.baseline,
      })),
    // m: quarter labels follow the language.
    [predictions, kind, m], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const option = useMemo(
    () => buildAccuracyOption(t, points, m, !isDesktop),
    [t, points, m, isDesktop],
  );
  const onTarget = points.filter((p) => p.model < TARGET_ERROR_PCT).length;
  const height = isDesktop ? 220 : 200;

  return (
    <ChartCard
      title={tr(m.track.accuracyTitle, { kind: m.track.kind[kind] })}
      subtitle={kind === 'backtest' ? m.track.accuracySubBacktest : m.track.accuracySub}
      info={m.track.accuracyInfo}
      sample={sample ? m.sample.log : undefined}
      legend={[
        { label: m.track.ourModel, color: 'var(--fc)' },
        { label: m.track.simpleGuess, color: 'var(--f4)' },
        { label: tr(m.track.target, { n: TARGET_ERROR_PCT }), color: 'var(--up)', kind: 'dashed' },
      ]}
      source={{ label: sample ? m.common.sampleSource : m.track.source }}
      state={state === 'ready' && points.length === 0 ? 'empty' : state}
      message={m.track.accuracyEmpty}
      onRetry={onRetry}
      height={height}
      table={
        <DataTable
          caption={tr(m.track.accuracyCaption, { kind: m.track.kind[kind] })}
          dense
          rows={[...points].reverse()}
          rowKey={(p) => p.quarterName}
          columns={[
            { id: 'q', header: m.common.quarter, value: (p) => p.quarterName },
            {
              id: 'model',
              header: m.track.ourModel,
              align: 'right',
              value: (p) => p.model,
              cell: (p) => formatPct(p.model),
            },
            {
              id: 'baseline',
              header: m.track.simpleGuess,
              align: 'right',
              value: (p) => p.baseline,
              cell: (p) => (p.baseline === null ? '–' : formatPct(p.baseline)),
            },
          ]}
        />
      }
    >
      <div className="px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={tr(m.track.accuracyAria, {
            kind: m.track.kind[kind],
            n: points.length,
            target: TARGET_ERROR_PCT,
            onTarget,
            below: points.filter((p) => p.baseline !== null && p.model < p.baseline).length,
          })}
        />
      </div>
    </ChartCard>
  );
}
