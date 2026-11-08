import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';

// Register only what the app draws; keeps the chart bundle a fraction of full ECharts.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsOption;
  height: number;
  /** One-sentence summary for screen readers; the canvas itself is invisible to them. */
  ariaLabel: string;
  className?: string;
}

export function EChart({ option, height, ariaLabel, className }: EChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
