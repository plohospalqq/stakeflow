import { describe, expect, it } from 'vitest';
import { mockScenarioApi } from '@/api/mock/scenario';
import type { ScenarioModel } from '@/api/types.scenario';
import {
  clampScenario,
  fromContract,
  modelScenario,
  NEUTRAL_SCENARIO,
  SCENARIO_LIMITS,
  scenarioProjection,
  toContract,
} from './scenario';

const model: ScenarioModel = {
  companyId: 'aker-bp',
  ticker: 'AKRBP',
  method: 'ols-monthly-log-returns',
  methodText: null,
  window: { start: '2019-01-01', end: '2026-10-01' },
  observations: 94,
  rSquared: 0.41,
  adjRSquared: null,
  coefficients: { brent: 0.28, ttf: 0.04, production: 0.55, eurusd: -0.3 },
  standardErrors: { brent: 0.06, ttf: 0.03, production: 0.21, eurusd: 0.14 },
  residualVolMonthly: 0.062,
  excludedMonths: [],
  backtest: null,
  runAt: '2026-11-02T04:00:00Z',
  version: 'test',
};

describe('scenario contract', () => {
  it('has the ranges agreed with the backend', () => {
    expect(SCENARIO_LIMITS).toEqual({
      brentChangePct: { min: -90, max: 300 },
      ttfChangePct: { min: -90, max: 300 },
      productionChangePct: { min: -100, max: 100 },
      eurusdChangePct: { min: -50, max: 100 },
      horizonMonths: { min: 1, max: 24 },
    });
  });

  it('clamps every parameter into its range and fills gaps with neutral values', () => {
    expect(
      clampScenario({
        brentChangePct: -150,
        ttfChangePct: 999,
        productionChangePct: -120,
        eurusdChangePct: 140,
        horizonMonths: 0,
      }),
    ).toEqual({
      brentChangePct: -90,
      ttfChangePct: 300,
      productionChangePct: -100,
      eurusdChangePct: 100,
      horizonMonths: 1,
    });
    expect(clampScenario({ horizonMonths: 40.6, brentChangePct: Number.NaN })).toEqual({
      ...NEUTRAL_SCENARIO,
      horizonMonths: 24,
    });
    expect(clampScenario({ horizonMonths: 6.4, ttfChangePct: 12.345 })).toMatchObject({
      horizonMonths: 6,
      ttfChangePct: 12.3,
    });
  });

  it('maps to and from the snake_case wire names, clamping on the way', () => {
    expect(toContract({ ...NEUTRAL_SCENARIO, brentChangePct: -30, horizonMonths: 99 })).toEqual({
      brent_change_pct: -30,
      ttf_change_pct: 0,
      production_change_pct: 0,
      eurusd_change_pct: 0,
      horizon_months: 24,
    });
    expect(fromContract({ ttf_change_pct: 50, horizon_months: 3 })).toEqual({
      ...NEUTRAL_SCENARIO,
      ttfChangePct: 50,
      horizonMonths: 3,
    });
  });
});

describe('scenario model', () => {
  it('is a transparent sum of β × log change', () => {
    const r = modelScenario(model, { ...NEUTRAL_SCENARIO, brentChangePct: -30 });
    // Like the backend: a driver's contribution is the change it alone would cause, in %.
    expect(r.contributions.brent).toBeCloseTo((Math.exp(0.28 * Math.log(0.7)) - 1) * 100, 6);
    expect(r.medianPct).toBeCloseTo((Math.exp(0.28 * Math.log(0.7)) - 1) * 100, 6);
    expect(r.lowPct).toBeLessThan(r.medianPct);
    expect(r.highPct).toBeGreaterThan(r.medianPct);
  });

  it('is uncertain even when nothing changes, and more so over longer horizons', () => {
    const short = modelScenario(model, { ...NEUTRAL_SCENARIO, horizonMonths: 1 });
    const long = modelScenario(model, { ...NEUTRAL_SCENARIO, horizonMonths: 24 });
    expect(short.medianPct).toBeCloseTo(0, 9);
    expect(long.highPct - long.lowPct).toBeGreaterThan(short.highPct - short.lowPct);
  });

  it('keeps a full production stop finite', () => {
    const r = modelScenario(model, { ...NEUTRAL_SCENARIO, productionChangePct: -100 });
    expect(Number.isFinite(r.medianPct)).toBe(true);
    expect(r.medianPct).toBeGreaterThan(-100);
  });
});

describe('scenario path', () => {
  const r = modelScenario(model, { ...NEUTRAL_SCENARIO, brentChangePct: -30, horizonMonths: 6 });

  it('has one point per month and ends at the answer', () => {
    expect(r.path.map((p) => p.monthOffset)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.path[5]).toEqual({
      monthOffset: 6,
      changePct: r.medianPct,
      lowPct: r.lowPct,
      highPct: r.highPct,
    });
  });

  it('moves in equal log steps, like the backend', () => {
    // Half way in time is half way in logs: β × ln(0.7) × 3/6.
    expect(r.path[2]?.changePct).toBeCloseTo((Math.exp(0.28 * Math.log(0.7) * 0.5) - 1) * 100, 6);
  });

  it('widens with time even when nothing changes', () => {
    const calm = modelScenario(model, { ...NEUTRAL_SCENARIO, horizonMonths: 12 });
    const widths = calm.path.map((p) => p.highPct - p.lowPct);
    expect(calm.path.every((p) => Math.abs(p.changePct) < 1e-9)).toBe(true);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths[0]).toBeGreaterThan(0);
  });
});

describe('scenarioProjection', () => {
  const price = { date: '2026-11-06', currency: 'NOK', base: 200, median: 0, low: 0, high: 0 };
  const path = [
    { monthOffset: 1, changePct: -2, lowPct: -8, highPct: 4 },
    { monthOffset: 2, changePct: -4, lowPct: -13, highPct: 6 },
    { monthOffset: 3, changePct: -6, lowPct: -17, highPct: 7.5 },
  ];

  it('starts at the last close with a range of zero width', () => {
    expect(scenarioProjection({ price, path })[0]).toEqual({
      date: '2026-11-06',
      price: 200,
      low: 200,
      high: 200,
    });
  });

  it('puts one point a month after the last close, as prices', () => {
    const [, ...months] = scenarioProjection({ price, path });
    expect(months.map((p) => p.date)).toEqual(['2026-12-06', '2027-01-06', '2027-02-06']);
    expect(months.map((p) => p.price)).toEqual([196, 192, 188]);
    expect(months.map((p) => p.low)).toEqual([184, 174, 166]);
    expect(months.map((p) => p.high)).toEqual([208, 212, 215]);
  });

  it('draws nothing without a share price or a path', () => {
    expect(scenarioProjection({ price: null, path })).toEqual([]);
    expect(scenarioProjection({ price, path: [] })).toEqual([]);
  });
});

const CONTEXT = { companyId: 'aker-bp', reference: null };

describe('free-text stand-in parser (sample)', () => {
  it('reads English, Ukrainian and Norwegian into parameters, never results', async () => {
    const en = await mockScenarioApi.parseScenario(
      'oil drops 25% and gas rises 10% over the next 6 months',
      CONTEXT,
    );
    expect(en.params).toMatchObject({ brentChangePct: -25, ttfChangePct: 10, horizonMonths: 6 });
    expect(en.recognised).toEqual(['brentChangePct', 'ttfChangePct', 'horizonMonths']);

    const uk = await mockScenarioApi.parseScenario('нафта впаде на 30% за 12 місяців', CONTEXT);
    expect(uk.params).toMatchObject({ brentChangePct: -30, horizonMonths: 12 });

    const nb = await mockScenarioApi.parseScenario(
      'oljeprisen faller 20 % og gassprisen stiger 15 %',
      CONTEXT,
    );
    expect(nb.params).toMatchObject({ brentChangePct: -20, ttfChangePct: 15 });
  });

  it('recognises nothing in text without numbers', async () => {
    expect(
      (await mockScenarioApi.parseScenario('what about the weather?', CONTEXT)).recognised,
    ).toEqual([]);
  });
});
