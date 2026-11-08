import type { BarSeriesOption, EChartsOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';
import type { FieldStack } from '@/lib/fieldStack';
import { formatMonth, formatMonthShort } from '@/lib/format';
import {
  baseGrid,
  baseTooltip,
  categoryAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from './chartBase';
import { firstDataIndex } from './params';

/** Field layers use the neutral ramp; oil, gas and condensate colours stay reserved. */
export function fieldColor(t: ChartTheme, index: number): string {
  return t.fields[index] ?? t.fields[t.fields.length - 1] ?? t.muted;
}

export function buildFieldStackOption(
  t: ChartTheme,
  stack: FieldStack,
  {
    compact = false,
    format,
    unitLabel,
  }: { compact?: boolean; format: (v: number) => string; unitLabel: string },
): EChartsOption {
  const series: BarSeriesOption[] = stack.layers.map((layer, i) => ({
    name: layer.name,
    type: 'bar',
    stack: 'fields',
    barCategoryGap: compact ? '18%' : '22%',
    color: fieldColor(t, i),
    // A hairline in the card colour keeps neighbouring grey layers apart.
    itemStyle: { borderColor: t.surface, borderWidth: compact ? 0 : 0.5 },
    emphasis: { disabled: true },
    data: layer.values,
  }));

  return {
    animation: false,
    grid: baseGrid(compact),
    xAxis: {
      ...categoryAxis(t, stack.months.map(formatMonthShort)),
      axisLabel: {
        color: t.muted,
        fontFamily: t.mono,
        fontSize: 11,
        hideOverlap: true,
        interval: compact ? 5 : 2,
      },
    },
    yAxis: valueAxis(t, compact),
    tooltip: {
      ...baseTooltip(t),
      axisPointer: { type: 'shadow', shadowStyle: { color: t.surface2, opacity: 0.6 } },
      formatter: (params) => {
        const i = firstDataIndex(params);
        const month = i === null ? undefined : stack.months[i];
        if (i === null || !month) return '';
        let html = tooltipTitle(formatMonth(month));
        stack.layers.forEach((layer, j) => {
          html += tooltipRow(fieldColor(t, j), layer.name, `${format(layer.values[i] ?? 0)}`);
        });
        html += tooltipRow(t.ink, 'Total', `${format(stack.totals[i] ?? 0)} ${unitLabel}`);
        return html;
      },
    },
    series,
  };
}
