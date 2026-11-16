/**
 * The share-price chart: real daily closes, then the scenario as a dashed line with its 80%
 * range, in the same visual language as the field forecast (dashed median, soft band, a
 * divider at the last real point). The dashed part is a what-if, never a forecast, and is
 * labelled so wherever it is named.
 */
import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';
import type { Dict } from '@/i18n/types';
import { formatDate, formatNumber } from '@/lib/format';
import type { ProjectionPoint } from '@/lib/scenario';
import {
  baseGrid,
  baseTooltip,
  timeAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
  withAlpha,
} from './chartBase';
import { firstDataDate } from './params';

export interface SharePriceChartData {
  ticker: string;
  currency: string;
  /** Daily closes, oldest first. */
  points: { date: string; close: number }[];
  /** The scenario from the last close on (lib/scenario.ts); empty draws the history alone. */
  projection: ProjectionPoint[];
  compact?: boolean;
}

/**
 * What the tooltip says for a date: the real close when there is one, and after the last
 * close the modelled price with its 80% range. On the day of the last close the scenario has
 * not moved yet, so the close says it all.
 */
export function sharePriceTooltip(
  t: ChartTheme,
  { ticker, currency, points, projection }: SharePriceChartData,
  { m }: { m: Dict },
  date: string,
): string {
  const close = points.find((p) => p.date === date)?.close;
  const s = projection.find((p) => p.date === date);
  let html = tooltipTitle(formatDate(date));
  if (close !== undefined) {
    html += tooltipRow(t.ink, ticker, `${formatNumber(close, 2)} ${currency}`);
  }
  if (s && date !== projection[0]?.date) {
    html += tooltipRow(
      t.forecast,
      m.scenarios.pathLegend,
      `${formatNumber(s.price, 1)} ${currency}`,
      true,
    );
    html += tooltipRow(
      withAlpha(t.forecast, 0.35),
      m.field.range80,
      `${formatNumber(s.low, 1)}–${formatNumber(s.high, 1)}`,
    );
  }
  return html;
}

export function buildSharePriceOption(
  t: ChartTheme,
  data: SharePriceChartData,
  labels: { m: Dict },
): EChartsOption {
  const { points, projection, compact = false } = data;
  const { m } = labels;
  const lastClose = projection[0]?.date;
  const fade = t.theme === 'dark' ? '#F5F5F7' : '#1D1D1F';

  const history: LineSeriesOption = {
    type: 'line',
    symbol: 'none',
    color: t.ink,
    lineStyle: { width: 2, color: t.ink },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: withAlpha(fade, 0.16) },
          { offset: 1, color: withAlpha(fade, 0) },
        ],
      },
    },
    data: points.map((p) => [p.date, p.close]),
  };

  // The band is two stacked series: an invisible floor at the low end, the range on top.
  const scenario: LineSeriesOption[] =
    projection.length > 1
      ? [
          {
            name: 'low',
            type: 'line',
            stack: 'band',
            symbol: 'none',
            lineStyle: { width: 0 },
            silent: true,
            data: projection.map((p) => [p.date, p.low]),
          },
          {
            name: m.field.range80,
            type: 'line',
            stack: 'band',
            symbol: 'none',
            lineStyle: { width: 0 },
            areaStyle: { color: withAlpha(t.forecast, 0.14) },
            silent: true,
            data: projection.map((p) => [p.date, p.high - p.low]),
          },
          {
            name: m.scenarios.pathLegend,
            type: 'line',
            symbol: 'none',
            color: t.forecast,
            lineStyle: { color: t.forecast, width: 2, type: [6, 5] },
            data: projection.map((p) => [p.date, p.price]),
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: t.forecast, width: 1, type: 'solid', opacity: 0.8 },
              label: {
                show: !compact,
                formatter: m.scenarios.lastClose,
                color: t.muted,
                fontFamily: t.sans,
                fontSize: 11,
                position: 'end',
              },
              data: [{ xAxis: lastClose }],
            },
          },
        ]
      : [];

  return {
    // No animation: the chart follows the sliders at once, which is also what a reader who
    // asked for reduced motion gets.
    animation: false,
    // Room above the plot for the 'Last close' label.
    grid: scenario.length > 0 && !compact ? { ...baseGrid(), top: 28 } : baseGrid(compact),
    xAxis: timeAxis(t, compact),
    // A round floor under the lowest value, so the axis never prints '161.42'.
    yAxis: {
      ...valueAxis(t, compact),
      scale: true,
      min: (v: { min: number }) => Math.floor((v.min * 0.95) / 10) * 10,
    },
    tooltip: {
      ...baseTooltip(t),
      formatter: (params) => {
        const date = firstDataDate(params);
        return date ? sharePriceTooltip(t, data, labels, date) : '';
      },
    },
    series: [history, ...scenario],
  };
}
