import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import type { AskAnswer } from '@/api/types';
import { EChart } from '@/components/charts/EChart';
import { baseGrid, baseTooltip, categoryAxis, valueAxis } from '@/components/charts/chartBase';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useI18n } from '@/i18n/useI18n';
import { formatNumber } from '@/lib/format';

/** A result that runs over time (the answer says so with chartType 'line'): one line per series. */
export function AskLine({ answer }: { answer: AskAnswer }) {
  const { m, t, lang } = useI18n();
  const theme = useChartTheme();
  const { chart, chartUnit, chartLegend } = answer;

  const option = useMemo<EChartsOption>(() => {
    const line = (name: string, color: string, data: (number | null)[]) => ({
      type: 'line' as const,
      name,
      color,
      symbolSize: 6,
      lineStyle: { width: 2, color },
      data,
    });
    return {
      animation: false,
      grid: baseGrid(),
      xAxis: categoryAxis(
        theme,
        chart.map((p) => p.label),
      ),
      yAxis: { ...valueAxis(theme), scale: true },
      tooltip: {
        ...baseTooltip(theme),
        valueFormatter: (v) => (typeof v === 'number' ? `${formatNumber(v, 1)} ${chartUnit}` : '–'),
      },
      series: [
        line(
          chartLegend.current,
          theme.forecast,
          chart.map((p) => p.value),
        ),
        ...(chartLegend.previous
          ? [
              line(
                chartLegend.previous,
                theme.faint,
                chart.map((p) => p.previous),
              ),
            ]
          : []),
      ],
    };
    // lang: tooltip numbers are formatted in the active language.
  }, [theme, chart, chartUnit, chartLegend, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = chart[0];
  const last = chart[chart.length - 1];
  return (
    <div className="px-2 pb-3">
      <EChart
        option={option}
        height={240}
        ariaLabel={
          first && last
            ? t(m.ask.lineAria, {
                n: chart.length,
                unit: chartUnit,
                from: `${first.label}: ${formatNumber(first.value, 1)}`,
                to: `${last.label}: ${formatNumber(last.value, 1)}`,
              })
            : m.ask.emptyChart
        }
      />
    </div>
  );
}
