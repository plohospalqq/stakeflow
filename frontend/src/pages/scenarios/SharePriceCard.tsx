import { useMemo } from 'react';
import { useSharePrices } from '@/api/hooks';
import { IS_STATIC_DEMO, isSample } from '@/api/mode';
import type { ScenarioResult } from '@/api/types.scenario';
import { ChartCard, type LegendItem } from '@/components/ChartCard';
import { EChart } from '@/components/charts/EChart';
import { buildSharePriceOption } from '@/components/charts/sharePriceOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatNumber } from '@/lib/format';
import { scenarioProjection } from '@/lib/scenario';

interface SharePriceCardProps {
  companyId: string;
  /** The current scenario; its path is drawn after the last close. */
  scenario: ScenarioResult | undefined;
}

/**
 * Share prices for context, then the scenario as a dashed path with its 80% range: where the
 * model puts the price month by month under the reader's assumptions. Not a forecast, and
 * labelled so. Live: the closes the operator imported from their own Euronext download (empty
 * when none were). Static demo and mocks: generated, badged.
 */
export function SharePriceCard({ companyId, scenario }: SharePriceCardProps) {
  const { m, t, plural, lang } = useI18n();
  const theme = useChartTheme();
  const isDesktop = useIsDesktop();
  const prices = useSharePrices(companyId);
  const sample = isSample('scenario');
  const data = prices.data;
  const points = useMemo(() => data?.points ?? [], [data]);
  const months = Math.round(points.length / 21);
  // Never another company's path under this company's prices (the previous answer can
  // linger for a moment after switching).
  const projection = useMemo(
    () => (scenario?.companyId === companyId ? scenarioProjection(scenario) : []),
    [scenario, companyId],
  );

  const option = useMemo(
    () =>
      buildSharePriceOption(
        theme,
        {
          ticker: data?.ticker ?? '',
          currency: data?.currency ?? '',
          points,
          projection,
          compact: !isDesktop,
        },
        { m },
      ),
    // lang: tooltip dates and numbers are formatted in the active language.
    [theme, isDesktop, points, data, projection, m, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const first = points[0];
  const last = points[points.length - 1];
  const end = projection[projection.length - 1];
  const height = isDesktop ? 260 : 200;
  const legend: LegendItem[] =
    data && end
      ? [
          { label: data.ticker, color: 'var(--tx)', kind: 'line' },
          { label: m.scenarios.pathLegend, color: 'var(--fc)', kind: 'dashed' },
          { label: m.field.range80, color: 'var(--fc)', kind: 'band' },
        ]
      : [];
  const summary =
    data && first && last
      ? t(m.scenarios.priceAria, {
          ticker: data.ticker,
          n: plural(m.common.months, months),
          from: formatNumber(first.close, 2),
          to: formatNumber(last.close, 2),
          currency: data.currency,
        })
      : null;
  const pathSummary =
    data && end
      ? t(m.scenarios.pathAria, {
          price: formatNumber(end.price, 1),
          currency: data.currency,
          date: formatDate(end.date),
          low: formatNumber(end.low, 1),
          high: formatNumber(end.high, 1),
        })
      : null;

  return (
    <ChartCard
      title={m.scenarios.priceTitle}
      subtitle={
        data
          ? t(m.scenarios.priceSub, {
              ticker: data.ticker,
              currency: data.currency,
              n: plural(m.common.months, months),
            })
          : '…'
      }
      sample={sample ? (IS_STATIC_DEMO ? m.sample.scenarioStatic : m.sample.sharePrice) : undefined}
      legend={legend}
      source={{ label: sample ? m.common.sampleSource : m.scenarios.priceSource }}
      state={
        prices.isError
          ? 'error'
          : prices.isPending
            ? 'loading'
            : points.length === 0
              ? 'empty'
              : 'ready'
      }
      message={m.scenarios.priceEmpty}
      onRetry={() => void prices.refetch()}
      height={height}
      className="nav:col-span-2"
    >
      <div className="px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={
            summary ? [summary, pathSummary].filter(Boolean).join('. ') : m.common.loadingChart
          }
        />
      </div>
    </ChartCard>
  );
}
