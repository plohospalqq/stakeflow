/**
 * Shared ECharts building blocks so every chart has the same axes, grid and tooltip.
 * Rules from the design: y-axis from 0 for areas and bars, legend lives outside the
 * chart (in ChartCard), tooltips list every series.
 */
import type { EChartsOption } from 'echarts';
import type { ChartTheme } from '@/hooks/useChartTheme';

type XAxisOption = Exclude<NonNullable<EChartsOption['xAxis']>, unknown[]>;
type YAxisOption = Exclude<NonNullable<EChartsOption['yAxis']>, unknown[]>;
type GridOption = Exclude<NonNullable<EChartsOption['grid']>, unknown[]>;
type TooltipOption = Exclude<NonNullable<EChartsOption['tooltip']>, unknown[]>;

export function baseGrid(compact = false): GridOption {
  return compact
    ? { left: 8, right: 8, top: 12, bottom: 4, containLabel: true }
    : { left: 12, right: 16, top: 16, bottom: 8, containLabel: true };
}

export function timeAxis(t: ChartTheme, compact = false): XAxisOption {
  return {
    type: 'time',
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: {
      color: t.muted,
      fontFamily: t.mono,
      fontSize: 11,
      hideOverlap: true,
      formatter: { year: '{yyyy}', month: compact ? '' : '{MMM}', day: '' },
    },
    splitLine: { show: false },
    splitNumber: compact ? 3 : 6,
  };
}

export function categoryAxis(t: ChartTheme, data: string[]): XAxisOption {
  return {
    type: 'category',
    data,
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11, hideOverlap: true },
  };
}

export function valueAxis(t: ChartTheme, compact = false, min?: number): YAxisOption {
  return {
    type: 'value',
    min: min ?? 0,
    splitNumber: compact ? 3 : 4,
    axisLabel: { color: t.muted, fontFamily: t.mono, fontSize: 11 },
    splitLine: { lineStyle: { color: t.line } },
  };
}

export function baseTooltip(t: ChartTheme): TooltipOption {
  return {
    trigger: 'axis',
    backgroundColor: t.surface,
    borderColor: t.lineStrong,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: t.ink, fontFamily: t.sans, fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: t.faint, type: 'dashed' } },
    confine: true,
  };
}

/** Tooltip row in the app's style: colour key, label, mono value. */
export function tooltipRow(color: string, label: string, value: string, dashed = false): string {
  const key = dashed
    ? `<span style="display:inline-block;width:12px;border-top:2px dashed ${color};margin-right:8px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:8px"></span>`;
  return `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><span>${key}${escapeHtml(label)}</span><span style="font-family:'JetBrains Mono Variable',monospace;font-variant-numeric:tabular-nums">${escapeHtml(value)}</span></div>`;
}

export function tooltipTitle(text: string): string {
  return `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(text)}</div>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ECharts colours accept rgba strings; the band uses the forecast colour at ~14% opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
