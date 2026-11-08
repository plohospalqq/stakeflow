import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';
import { formatMonth } from '@/lib/format';
import {
  baseGrid,
  baseTooltip,
  timeAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
  withAlpha,
} from './chartBase';

/** One month, already in the display unit. */
export interface ProductPoint {
  month: string;
  oil: number;
  gas: number;
  /** NGL + condensate */
  nglCond: number;
}

/** Forecast in the display unit; the first point repeats the last actual month. */
export interface ForecastPoint {
  month: string;
  p10: number;
  p50: number;
  p90: number;
}

export type ProductFilter = 'all' | 'oil' | 'gas' | 'nglCond';

export interface ChartEvent {
  month: string;
  label: string;
}

export interface ProductionChartProps {
  history: ProductPoint[];
  forecast?: ForecastPoint[];
  product?: ProductFilter;
  events?: ChartEvent[];
  height?: number;
  compact?: boolean;
  ariaLabel: string;
  format: (value: number) => string;
  unitLabel: string;
}

const PRODUCTS = [
  { key: 'oil', label: 'Oil', color: (t: ChartTheme) => t.oil },
  { key: 'gas', label: 'Gas', color: (t: ChartTheme) => t.gas },
  { key: 'nglCond', label: 'NGL + condensate', color: (t: ChartTheme) => t.cond },
] as const;

function readMonth(param: unknown): string | null {
  if (typeof param !== 'object' || param === null || !('data' in param)) return null;
  const data: unknown = param.data;
  return Array.isArray(data) && typeof data[0] === 'string' ? data[0] : null;
}

export function buildProductionOption(
  t: ChartTheme,
  {
    history,
    forecast = [],
    product = 'all',
    events = [],
    compact = false,
    format,
    unitLabel,
  }: Omit<ProductionChartProps, 'ariaLabel' | 'height'>,
): EChartsOption {
  const shown = PRODUCTS.filter((p) => product === 'all' || p.key === product);
  const byMonth = new Map(history.map((h) => [h.month, h]));
  const fcByMonth = new Map(forecast.map((f) => [f.month, f]));
  const latestMonth = history[history.length - 1]?.month;

  const areaSeries: LineSeriesOption[] = shown.map((p) => ({
    name: p.label,
    type: 'line',
    stack: 'products',
    symbol: 'none',
    lineStyle: { width: 0 },
    areaStyle: { color: p.color(t), opacity: 0.88 },
    color: p.color(t),
    emphasis: { disabled: true },
    data: history.map((h) => [h.month, h[p.key]]),
  }));

  const forecastSeries: LineSeriesOption[] =
    forecast.length > 1
      ? [
          {
            name: 'p10',
            type: 'line',
            stack: 'band',
            symbol: 'none',
            lineStyle: { width: 0 },
            silent: true,
            data: forecast.map((f) => [f.month, f.p10]),
          },
          {
            name: '80% range',
            type: 'line',
            stack: 'band',
            symbol: 'none',
            lineStyle: { width: 0 },
            areaStyle: { color: withAlpha(t.forecast, 0.14) },
            silent: true,
            data: forecast.map((f) => [f.month, f.p90 - f.p10]),
          },
          {
            name: 'Forecast',
            type: 'line',
            symbol: 'none',
            color: t.forecast,
            lineStyle: { color: t.forecast, width: 2, type: [6, 5] },
            data: forecast.map((f) => [f.month, f.p50]),
            markLine: latestMonth
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: t.forecast, width: 1, type: 'solid', opacity: 0.8 },
                  label: {
                    show: !compact,
                    formatter: 'Latest data',
                    color: t.muted,
                    fontFamily: t.sans,
                    fontSize: 11,
                    position: 'end',
                  },
                  data: [{ xAxis: latestMonth }],
                }
              : undefined,
          },
        ]
      : [];

  const eventSeries: LineSeriesOption[] =
    events.length && !compact
      ? [
          {
            name: 'events',
            type: 'line',
            data: [],
            silent: true,
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: t.faint, type: 'dashed', width: 1 },
              label: {
                formatter: '{b}',
                color: t.muted,
                fontFamily: t.sans,
                fontSize: 11,
                position: 'end',
              },
              data: events.map((e) => ({ xAxis: e.month, name: e.label })),
            },
          },
        ]
      : [];

  return {
    animation: false,
    // Room above the plot for the 'Latest data' and event labels.
    grid: { ...baseGrid(compact), top: compact ? 12 : 28 },
    xAxis: timeAxis(t, compact),
    yAxis: valueAxis(t, compact),
    tooltip: {
      ...baseTooltip(t),
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params;
        const month = readMonth(first);
        if (!month) return '';
        const h = byMonth.get(month);
        const f = fcByMonth.get(month);
        let html = tooltipTitle(formatMonth(month));
        if (h) {
          let total = 0;
          for (const p of shown) {
            html += tooltipRow(p.color(t), p.label, `${format(h[p.key])} ${unitLabel}`);
            total += h[p.key];
          }
          if (shown.length > 1) html += tooltipRow(t.ink, 'Total', `${format(total)} ${unitLabel}`);
        }
        if (f && (!h || month !== latestMonth)) {
          html += tooltipRow(t.forecast, 'Forecast (p50)', `${format(f.p50)} ${unitLabel}`, true);
          html += tooltipRow(
            withAlpha(t.forecast, 0.35),
            '80% range',
            `${format(f.p10)}–${format(f.p90)}`,
          );
        }
        return html;
      },
    },
    series: [...areaSeries, ...forecastSeries, ...eventSeries],
  };
}
