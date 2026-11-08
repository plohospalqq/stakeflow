import { describe, expect, it } from 'vitest';
import type { CompanyFieldMonthly, Prediction, ReportedQuarter } from '@/api/types';
import { stackFields } from './fieldStack';
import { estimateRevenue } from './revenue';
import {
  accuracyByQuarter,
  errorTone,
  leadDays,
  modelStats,
  reconciledQuarters,
  reconciliationSummary,
} from './trackRecord';

const prediction = (over: Partial<Prediction>): Prediction => ({
  id: 'x',
  companyId: 'aker-bp',
  companyName: 'Aker BP',
  quarterStart: '2026-07-01',
  madeAt: '2026-09-30T23:59:00Z',
  reportedOn: '2026-10-14',
  expectedReportOn: '2026-10-14',
  predicted: 100,
  lo: 97,
  hi: 103,
  actual: 100,
  baseline: 100,
  status: 'resolved',
  hash: 'abc',
  commitUrl: null,
  modelVersion: 'v',
  ...over,
});

const quarter = (over: Partial<ReportedQuarter>): ReportedQuarter => ({
  quarterStart: '2026-04-01',
  monthsInData: 3,
  isComplete: true,
  attributedKboed: 380.8,
  reportedKboed: 383.6,
  errorPct: -0.74,
  reportedOn: '2026-10-14',
  sourceUrl: null,
  ...over,
});

describe('leadDays', () => {
  it('counts calendar days from the frozen forecast to the trading update', () => {
    expect(leadDays('2026-09-30T23:59:00Z', '2026-10-14')).toBe(14);
    expect(leadDays('2026-09-30T23:59:00Z', '2026-10-12')).toBe(12);
  });
});

describe('errorTone', () => {
  it('uses the 2% and 4% thresholds on the absolute error', () => {
    expect(errorTone(1.99)).toBe('good');
    expect(errorTone(-2)).toBe('fair');
    expect(errorTone(3.9)).toBe('fair');
    expect(errorTone(-4.1)).toBe('poor');
  });
});

describe('accuracyByQuarter', () => {
  it('averages absolute errors per quarter and skips open predictions', () => {
    const rows = accuracyByQuarter([
      prediction({ predicted: 102, baseline: 95 }),
      prediction({ companyId: 'var-energi', predicted: 99, baseline: 110 }),
      prediction({ quarterStart: '2026-10-01', status: 'open', actual: null }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBeCloseTo(1.5);
    expect(rows[0]?.baseline).toBeCloseTo(7.5);
    expect(rows[0]?.count).toBe(2);
  });

  it('agrees with the overall model stats', () => {
    const log = [prediction({ predicted: 104, lo: 101, hi: 107 }), prediction({ predicted: 98 })];
    const stats = modelStats(log);
    expect(stats?.modelError).toBeCloseTo(3);
    expect(stats?.inRange).toBe(1);
    expect(stats?.bias).toBeCloseTo(1);
  });
});

describe('reconciliation', () => {
  it('keeps only quarters with a reported figure', () => {
    const rows = reconciledQuarters('aker-bp', [
      quarter({ quarterStart: '2026-01-01', reportedKboed: null, errorPct: null }),
      quarter({}),
    ]);
    expect(rows.map((r) => r.quarter.quarterStart)).toEqual(['2026-04-01']);
  });

  it('leaves provisional quarters out of the average gap', () => {
    const summary = reconciliationSummary(
      reconciledQuarters('aker-bp', [
        quarter({ errorPct: -0.74 }),
        quarter({ quarterStart: '2026-07-01', isComplete: false, monthsInData: 2, errorPct: -5 }),
        quarter({ quarterStart: '2025-07-01', errorPct: 2.1 }),
      ]),
    );
    expect(summary.complete).toBe(2);
    expect(summary.partial).toBe(1);
    expect(summary.meanAbsGap).toBeCloseTo(1.42);
    expect(summary.maxAbsGap).toBeCloseTo(2.1);
  });

  it('has no average when every quarter is provisional', () => {
    const summary = reconciliationSummary(
      reconciledQuarters('aker-bp', [quarter({ isComplete: false })]),
    );
    expect(summary.meanAbsGap).toBeNull();
  });
});

describe('estimateRevenue', () => {
  it('prices liquids at Brent × realisation and gas at TTF × energy content', () => {
    const r = estimateRevenue({
      kboed: 100,
      liquidsShare: 0.8,
      days: 92,
      brentUsdPerBbl: 70,
      ttfEurPerMwh: 30,
      eurUsd: 1.2,
      realisationPct: 100,
    });
    // 80 kbbl/d × 92 d × $70
    expect(r.liquidsUsd).toBeCloseTo(80_000 * 92 * 70, 0);
    // 20 kboe/d gas = 20,000 / 6.2898 Sm³ o.e./d = 3.18 MSm³ gas/d
    expect(r.gasMsm3PerDay).toBeCloseTo(3.1798, 3);
    const gasMwh = (r.gasMsm3PerDay * 1e6 * 92 * 10.8) / 1000;
    expect(r.gasUsd).toBeCloseTo(gasMwh * 30 * 1.2, 0);
    expect(r.totalUsd).toBeCloseTo(r.liquidsUsd + r.gasUsd, 0);
  });

  it('scales liquids with the realisation percentage only', () => {
    const base = {
      kboed: 100,
      liquidsShare: 0.5,
      days: 90,
      brentUsdPerBbl: 70,
      ttfEurPerMwh: 30,
      eurUsd: 1.1,
    };
    const full = estimateRevenue({ ...base, realisationPct: 100 });
    const lower = estimateRevenue({ ...base, realisationPct: 90 });
    expect(lower.liquidsUsd).toBeCloseTo(full.liquidsUsd * 0.9, 0);
    expect(lower.gasUsd).toBeCloseTo(full.gasUsd, 0);
  });
});

describe('stackFields', () => {
  const months = ['2026-07-01', '2026-08-01'];
  const row = (fieldId: number, month: string, oeSm3: number): CompanyFieldMonthly => ({
    fieldId,
    fieldName: `F${fieldId}`,
    month,
    sharePct: 50,
    oeSm3,
  });
  const identity = (v: number) => v;

  it('names the largest fields and folds the rest into Other', () => {
    const rows = [1, 2, 3, 4].flatMap((id) => [
      row(id, '2026-07-01', id * 10),
      row(id, '2026-08-01', id * 10 + 1),
    ]);
    const stack = stackFields(rows, months, identity, 3);
    expect(stack.layers.map((l) => l.name)).toEqual(['F4', 'F3', 'Other (2 fields)']);
    expect(stack.layers[2]?.values).toEqual([30, 32]);
    expect(stack.totals).toEqual([100, 104]);
    expect(stack.layers.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1);
  });

  it('shows every field when they fit', () => {
    const stack = stackFields(
      [row(1, '2026-08-01', 5), row(2, '2026-08-01', 15)],
      months,
      identity,
    );
    expect(stack.layers.map((l) => l.fieldId)).toEqual([2, 1]);
    expect(stack.layers[0]?.values).toEqual([0, 15]);
  });
});
