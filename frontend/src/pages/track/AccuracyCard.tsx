import { useMemo } from 'react';
import type { Prediction } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { EChart } from '@/components/charts/EChart';
import { buildAccuracyOption, TARGET_ERROR_PCT } from '@/components/charts/accuracyOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { formatPct, formatQuarter, formatQuarterShort } from '@/lib/format';
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
  const { m, t: tr } = useI18n();
  const isDesktop = useIsDesktop();
  const points = useMemo(
    () =>
      accuracyByQuarter(predictions).map((q) => ({
        label: formatQuarterShort(q.quarterStart),
        quarterName: formatQuarter(q.quarterStart),
        model: q.model,
        baseline: q.baseline,
      })),
    // m: quarter labels follow the language.
    [predictions, m], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const option = useMemo(
    () => buildAccuracyOption(t, points, m, !isDesktop),
    [t, points, m, isDesktop],
  );
  const onTarget = points.filter((p) => p.model < TARGET_ERROR_PCT).length;
  const height = isDesktop ? 220 : 200;

  return (
    <ChartCard
      title={m.track.accuracyTitle}
      subtitle={m.track.accuracySub}
      info={m.track.accuracyInfo}
      sample={m.sample.log}
      legend={[
        { label: m.track.ourModel, color: 'var(--fc)' },
        { label: m.track.simpleGuess, color: 'var(--f4)' },
        { label: tr(m.track.target, { n: TARGET_ERROR_PCT }), color: 'var(--up)', kind: 'dashed' },
      ]}
      source={{ label: m.common.sampleSource }}
      state={state === 'ready' && points.length === 0 ? 'empty' : state}
      message={m.track.accuracyEmpty}
      onRetry={onRetry}
      height={height}
      table={
        <DataTable
          caption={m.track.accuracyCaption}
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
          ariaLabel={tr(m.track.accuracyAria, {
            n: points.length,
            target: TARGET_ERROR_PCT,
            onTarget,
            below: points.filter((p) => p.model < p.baseline).length,
          })}
        />
      </div>
    </ChartCard>
  );
}
