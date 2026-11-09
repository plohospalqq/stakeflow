import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { useSharePrices } from '@/api/hooks';
import { IS_STATIC_DEMO, isSample } from '@/api/mode';
import { ChartCard } from '@/components/ChartCard';
import { EChart } from '@/components/charts/EChart';
import {
  baseGrid,
  baseTooltip,
  timeAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
  withAlpha,
} from '@/components/charts/chartBase';
import { firstDataIndex } from '@/components/charts/params';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * Share prices for context. Live: the closes the operator imported from their own Euronext
 * download (empty when none were). Static demo and mocks: generated, badged.
 */
export function SharePriceCard({ companyId }: { companyId: string }) {
  const { m, t, plural, lang } = useI18n();
  const theme = useChartTheme();
  const isDesktop = useIsDesktop();
  const prices = useSharePrices(companyId);
  const sample = isSample('scenario');
  const data = prices.data;
  const points = useMemo(() => data?.points ?? [], [data]);
  const months = Math.round(points.length / 21);

  const option = useMemo<EChartsOption>(() => {
    const ink = theme.ink;
    return {
      animation: false,
      grid: baseGrid(!isDesktop),
      xAxis: timeAxis(theme, !isDesktop),
      // A round floor under the lowest close, so the axis never prints '161.42'.
      yAxis: {
        ...valueAxis(theme, !isDesktop),
        scale: true,
        min: (v: { min: number }) => Math.floor((v.min * 0.95) / 10) * 10,
      },
      tooltip: {
        ...baseTooltip(theme),
        formatter: (params) => {
          const i = firstDataIndex(params);
          const p = i === null ? undefined : points[i];
          if (!p || !data) return '';
          return (
            tooltipTitle(formatDate(p.date)) +
            tooltipRow(ink, data.ticker, `${formatNumber(p.close, 2)} ${data.currency}`)
          );
        },
      },
      series: [
        {
          type: 'line',
          symbol: 'none',
          color: ink,
          lineStyle: { width: 2, color: ink },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: withAlpha(theme.theme === 'dark' ? '#F5F5F7' : '#1D1D1F', 0.16),
                },
                { offset: 1, color: withAlpha(theme.theme === 'dark' ? '#F5F5F7' : '#1D1D1F', 0) },
              ],
            },
          },
          data: points.map((p) => [p.date, p.close]),
        },
      ],
    };
    // lang: tooltip dates and numbers are formatted in the active language.
  }, [theme, isDesktop, points, data, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = points[0];
  const last = points[points.length - 1];
  const height = isDesktop ? 260 : 200;

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
      legend={[]}
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
            data && first && last
              ? t(m.scenarios.priceAria, {
                  ticker: data.ticker,
                  n: plural(m.common.months, months),
                  from: formatNumber(first.close, 2),
                  to: formatNumber(last.close, 2),
                  currency: data.currency,
                })
              : m.common.loadingChart
          }
        />
      </div>
    </ChartCard>
  );
}
