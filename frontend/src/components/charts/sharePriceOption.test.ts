import { renderHook } from '@testing-library/react';
import type { LineSeriesOption } from 'echarts';
import { describe, expect, it } from 'vitest';
import { useChartTheme } from '@/hooks/useChartTheme';
import { en } from '@/i18n/en';
import type { ProjectionPoint } from '@/lib/scenario';
import {
  buildSharePriceOption,
  sharePriceTooltip,
  type SharePriceChartData,
} from './sharePriceOption';

const points = [
  { date: '2026-11-04', close: 198 },
  { date: '2026-11-05', close: 201.5 },
  { date: '2026-11-06', close: 200 },
];
const projection: ProjectionPoint[] = [
  { date: '2026-11-06', price: 200, low: 200, high: 200 },
  { date: '2026-12-06', price: 196, low: 184, high: 208 },
  { date: '2027-01-06', price: 192, low: 174, high: 212 },
];

function build(withProjection: ProjectionPoint[], compact = false) {
  const theme = renderHook(() => useChartTheme()).result.current;
  const data: SharePriceChartData = {
    ticker: 'AKRBP',
    currency: 'NOK',
    points,
    projection: withProjection,
    compact,
  };
  const option = buildSharePriceOption(theme, data, { m: en });
  const all = Array.isArray(option.series) ? option.series : [];
  const series = all.filter((s): s is LineSeriesOption => s.type === 'line');
  const tip = (date: string) => sharePriceTooltip(theme, data, { m: en }, date);
  return { option, series, theme, tip };
}

describe('buildSharePriceOption', () => {
  it('draws the closes alone when there is no scenario', () => {
    const { series } = build([]);
    expect(series).toHaveLength(1);
    expect(series[0]?.data).toEqual(points.map((p) => [p.date, p.close]));
  });

  it('adds the scenario as a dashed line in the forecast colour, from the last close', () => {
    const { series, theme } = build(projection);
    const path = series[3];
    expect(path?.name).toBe('Scenario path (not a forecast)');
    expect(path?.lineStyle).toMatchObject({ type: [6, 5], color: theme.forecast });
    expect(path?.data).toEqual([
      ['2026-11-06', 200],
      ['2026-12-06', 196],
      ['2027-01-06', 192],
    ]);
  });

  it('stacks the 80% range on its low end, so the fill spans low to high', () => {
    const { series } = build(projection);
    const [, floor, range] = series;
    expect(floor?.stack).toBe('band');
    expect(range?.stack).toBe('band');
    expect(floor?.data).toEqual([
      ['2026-11-06', 200],
      ['2026-12-06', 184],
      ['2027-01-06', 174],
    ]);
    expect(range?.data).toEqual([
      ['2026-11-06', 0],
      ['2026-12-06', 24],
      ['2027-01-06', 38],
    ]);
    expect(range?.areaStyle).toBeDefined();
  });

  it('marks the last close with a divider, labelled where there is room', () => {
    const wide = build(projection).series[3]?.markLine;
    expect(wide?.data).toEqual([{ xAxis: '2026-11-06' }]);
    expect(wide?.label).toMatchObject({ show: true, formatter: 'Last close' });
    expect(build(projection, true).series[3]?.markLine?.label).toMatchObject({ show: false });
  });

  it('does not animate, so it follows the sliders and respects reduced motion', () => {
    expect(build(projection).option.animation).toBe(false);
  });

  it('tells a real close from a modelled price in the tooltip', () => {
    const { tip } = build(projection);
    expect(tip('2026-11-05')).toContain('201.50 NOK');
    expect(tip('2026-11-05')).not.toContain('Scenario path');

    const future = tip('2027-01-06');
    expect(future).toContain('6 Jan 2027');
    expect(future).toContain('Scenario path (not a forecast)');
    expect(future).toContain('192.0 NOK');
    expect(future).toContain('80% range');
    expect(future).toContain('174.0–212.0');
  });

  it('shows only the close on the day the scenario starts', () => {
    const start = build(projection).tip('2026-11-06');
    expect(start).toContain('200.00 NOK');
    expect(start).not.toContain('Scenario path');
  });
});
