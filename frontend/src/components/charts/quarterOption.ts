/**
 * Quarterly bar charts. Two different stories, kept in separate charts on purpose:
 * - reconciliation (real): Sodir-attributed production vs what the company reported;
 * - nowcast (sample): our frozen forecast vs the reported number, with the open quarter.
 */
import type { BarSeriesOption, EChartsOption, ScatterSeriesOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';
import { fill } from '@/i18n/text';
import type { Dict } from '@/i18n/types';
import { formatPct } from '@/lib/format';
import { errorTone, type ErrorTone } from '@/lib/trackRecord';
import {
  baseGrid,
  baseTooltip,
  categoryAxis,
  tooltipRow,
  tooltipTitle,
  valueAxis,
  withAlpha,
} from './chartBase';
import { firstDataIndex } from './params';

type BarItem = NonNullable<BarSeriesOption['data']>[number];

interface ChartOpts {
  compact?: boolean;
  format: (v: number) => string;
  unitLabel: string;
  /** The active dictionary, for series names and tooltip labels. */
  m: Dict;
}

export function toneColor(t: ChartTheme, tone: ErrorTone): string {
  if (tone === 'good') return t.up;
  if (tone === 'fair') return t.warn;
  return t.down;
}

/** Bars for reported or attributed volumes: a mid grey that reads on both themes. */
function barColor(t: ChartTheme): string {
  return t.fields[3] ?? t.muted;
}

/** 'Q2 26' on one line, or stacked on phones; an optional note goes on the next line. */
function quarterLabel(label: string, compact: boolean, note: string | null): string {
  const base = compact ? label.replace(' ', '\n') : label;
  return note ? `${base}\n${note}` : base;
}

/** Eight quarters always fit, and a skipped quarter label reads like missing data. */
function quarterAxis(t: ChartTheme, labels: string[]) {
  const axis = categoryAxis(t, labels);
  return { ...axis, axisLabel: { ...axis.axisLabel, interval: 0, hideOverlap: false } };
}

function axisPointer(t: ChartTheme) {
  return { type: 'shadow' as const, shadowStyle: { color: t.surface2, opacity: 0.6 } };
}

export interface ReconciliationPoint {
  /** 'Q2 26' */
  label: string;
  quarterName: string;
  attributed: number;
  reported: number | null;
  gapPct: number | null;
  monthsInData: number;
}

export function buildReconciliationOption(
  t: ChartTheme,
  points: ReconciliationPoint[],
  { compact = false, format, unitLabel, m }: ChartOpts,
): EChartsOption {
  const color = barColor(t);
  const bars: BarItem[] = points.map((p) => {
    const partial = p.monthsInData < 3;
    return {
      value: p.attributed,
      itemStyle: partial
        ? {
            color: withAlpha(color, 0.3),
            borderColor: color,
            borderType: 'dashed',
            borderWidth: 1,
          }
        : { color },
      label:
        p.gapPct === null
          ? { show: false }
          : {
              show: true,
              position: 'top',
              distance: 10,
              formatter: formatPct(p.gapPct, compact ? 1 : 2, true),
              color: toneColor(t, errorTone(p.gapPct)),
              fontFamily: t.sans,
              fontSize: 11,
            },
    };
  });

  const reported: ScatterSeriesOption = {
    name: m.recon.legendReported,
    type: 'scatter',
    symbol: 'circle',
    symbolSize: compact ? 9 : 11,
    z: 5,
    itemStyle: { color: t.surface, borderColor: t.forecast, borderWidth: 2 },
    data: points.map((p) => p.reported),
  };

  return {
    animation: false,
    grid: { ...baseGrid(compact), top: 26 },
    xAxis: quarterAxis(
      t,
      points.map((p) =>
        quarterLabel(
          p.label,
          compact,
          p.monthsInData < 3 ? fill(m.charts.monthsShort, { n: p.monthsInData }) : null,
        ),
      ),
    ),
    yAxis: valueAxis(t, compact),
    tooltip: {
      ...baseTooltip(t),
      axisPointer: axisPointer(t),
      formatter: (params) => {
        const i = firstDataIndex(params);
        const p = i === null ? undefined : points[i];
        if (!p) return '';
        let html = tooltipTitle(p.quarterName);
        html += tooltipRow(
          color,
          p.monthsInData < 3
            ? `${m.recon.legendAttributed} (${fill(m.company.monthsOf3, { n: p.monthsInData })})`
            : m.recon.legendAttributed,
          `${format(p.attributed)} ${unitLabel}`,
        );
        if (p.reported !== null) {
          html += tooltipRow(
            t.forecast,
            m.recon.legendReported,
            `${format(p.reported)} ${unitLabel}`,
          );
        }
        if (p.gapPct !== null)
          html += tooltipRow(t.ink, m.charts.gap, formatPct(p.gapPct, 2, true));
        return html;
      },
    },
    series: [
      {
        name: m.recon.legendAttributed,
        type: 'bar',
        barMaxWidth: 46,
        emphasis: { disabled: true },
        data: bars,
      },
      reported,
    ],
  };
}

export interface NowcastPoint {
  label: string;
  quarterName: string;
  predicted: number;
  lo: number;
  hi: number;
  /** Null while the quarter is open. */
  actual: number | null;
  errorPct: number | null;
  /** Replayed with today's data rather than frozen at the time. */
  backtest: boolean;
}

export function buildNowcastOption(
  t: ChartTheme,
  points: NowcastPoint[],
  { compact = false, format, unitLabel, m }: ChartOpts,
): EChartsOption {
  const color = barColor(t);
  const labelStyle = { fontFamily: t.sans, fontSize: 11 };
  const bars: BarItem[] = points.map((p) =>
    p.actual === null
      ? {
          value: p.predicted,
          itemStyle: {
            color: withAlpha(t.forecast, 0.08),
            borderColor: t.forecast,
            borderType: 'dashed',
            borderWidth: 1.5,
          },
          // Clear of the range whisker that sticks out above the open bar.
          label: {
            show: true,
            position: 'top',
            distance: 16,
            formatter: format(p.predicted),
            color: t.ink,
            ...labelStyle,
          },
        }
      : {
          value: p.actual,
          itemStyle: { color },
          // Phones have no room for eight labels; the tooltip and table still show the error.
          label:
            p.errorPct === null || compact
              ? { show: false }
              : {
                  show: true,
                  position: 'top',
                  distance: 8,
                  formatter: formatPct(p.errorPct, 1, true),
                  color: toneColor(t, errorTone(p.errorPct)),
                  ...labelStyle,
                },
        },
  );
  const open = points.filter((p) => p.actual === null);

  return {
    animation: false,
    grid: { ...baseGrid(compact), top: 30 },
    xAxis: quarterAxis(
      t,
      points.map((p) => quarterLabel(p.label, compact, p.actual === null ? m.charts.open : null)),
    ),
    yAxis: valueAxis(t, compact),
    tooltip: {
      ...baseTooltip(t),
      axisPointer: axisPointer(t),
      formatter: (params) => {
        const i = firstDataIndex(params);
        const p = i === null ? undefined : points[i];
        if (!p) return '';
        let html = tooltipTitle(
          `${p.quarterName}${p.actual === null ? ` · ${m.charts.open}` : ''}${
            p.backtest ? ` · ${m.charts.backtest}` : ''
          }`,
        );
        html += tooltipRow(
          t.forecast,
          m.charts.nowcast,
          `${format(p.predicted)} ${unitLabel}`,
          true,
        );
        html += tooltipRow(
          withAlpha(t.forecast, 0.35),
          m.field.range80,
          `${format(p.lo)}–${format(p.hi)}`,
        );
        if (p.actual !== null) {
          html += tooltipRow(color, m.charts.reported, `${format(p.actual)} ${unitLabel}`);
        }
        if (p.errorPct !== null)
          html += tooltipRow(t.ink, m.charts.error, formatPct(p.errorPct, 1, true));
        return html;
      },
    },
    series: [
      {
        name: m.charts.reported,
        type: 'bar',
        barMaxWidth: 46,
        emphasis: { disabled: true },
        data: bars,
        markLine: open.length
          ? {
              silent: true,
              symbol: ['none', 'none'],
              label: { show: false },
              lineStyle: { color: t.forecast, width: 2, type: 'solid' },
              data: open.map((p) => [
                { coord: [points.indexOf(p), p.lo] },
                { coord: [points.indexOf(p), p.hi] },
              ]),
            }
          : undefined,
      },
      {
        name: m.charts.nowcast,
        type: 'scatter',
        symbol: 'rect',
        symbolSize: compact ? [18, 3] : [30, 3],
        z: 5,
        color: t.forecast,
        data: points.map((p) => (p.actual === null ? null : p.predicted)),
      },
    ],
  };
}
