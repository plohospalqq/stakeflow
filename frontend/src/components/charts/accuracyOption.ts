import type { EChartsOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';
import { formatPct } from '@/lib/format';
import {
  baseGrid,
  baseTooltip,
  categoryAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from './chartBase';
import { firstDataIndex } from './params';

export interface AccuracyPoint {
  label: string;
  quarterName: string;
  model: number;
  baseline: number;
}

/** Below this average error a quarter counts as on target. */
export const TARGET_ERROR_PCT = 2;

export function buildAccuracyOption(
  t: ChartTheme,
  points: AccuracyPoint[],
  compact = false,
): EChartsOption {
  const baselineColor = t.fields[3] ?? t.muted;
  return {
    animation: false,
    // Room on the right for the target label, clear of the bars.
    grid: { ...baseGrid(compact), top: 24, right: compact ? 56 : 76 },
    xAxis: categoryAxis(
      t,
      points.map((p) => p.label),
    ),
    yAxis: {
      ...valueAxis(t, compact),
      axisLabel: {
        color: t.muted,
        fontFamily: t.mono,
        fontSize: 11,
        formatter: (v: number) => `${v}%`,
      },
    },
    tooltip: {
      ...baseTooltip(t),
      axisPointer: { type: 'shadow', shadowStyle: { color: t.surface2, opacity: 0.6 } },
      formatter: (params) => {
        const i = firstDataIndex(params);
        const p = i === null ? undefined : points[i];
        if (!p) return '';
        return (
          tooltipTitle(p.quarterName) +
          tooltipRow(t.forecast, 'Our model', formatPct(p.model)) +
          tooltipRow(baselineColor, 'Simple guess', formatPct(p.baseline))
        );
      },
    },
    series: [
      {
        name: 'Our model',
        type: 'bar',
        color: t.forecast,
        barMaxWidth: 28,
        barGap: '15%',
        emphasis: { disabled: true },
        label: {
          show: !compact,
          position: 'top',
          formatter: (p) => (typeof p.value === 'number' ? formatPct(p.value) : ''),
          color: t.ink,
          fontFamily: t.mono,
          fontSize: 11,
        },
        data: points.map((p) => p.model),
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { color: t.up, type: 'dashed', width: 1 },
          label: {
            formatter: `${TARGET_ERROR_PCT}% target`,
            color: t.up,
            fontFamily: t.sans,
            fontSize: 11,
            position: 'end',
          },
          data: [{ yAxis: TARGET_ERROR_PCT }],
        },
      },
      {
        name: 'Simple guess',
        type: 'bar',
        color: baselineColor,
        barMaxWidth: 28,
        emphasis: { disabled: true },
        data: points.map((p) => p.baseline),
      },
    ],
  };
}
