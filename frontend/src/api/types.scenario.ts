/**
 * The what-if scenario explorer. The parameter contract mirrors the backend's
 * {brent_change_pct, ttf_change_pct, production_change_pct, eurusd_change_pct,
 * horizon_months} in camelCase; lib/scenario.ts maps between the two and clamps ranges.
 * Everything here is sample data until the scenario endpoints are wired.
 */
import type { Month } from './types';

export interface ScenarioParams {
  /** Brent oil price change, % (−90…+300). */
  brentChangePct: number;
  /** TTF gas price change, % (−90…+300). */
  ttfChangePct: number;
  /** Company production change, % (−100…+100). */
  productionChangePct: number;
  /** EUR/USD change, % (−50…+100); positive = a weaker dollar. */
  eurusdChangePct: number;
  /** Over how many months the change plays out (1…24). */
  horizonMonths: number;
}

export type ScenarioDriver = 'brent' | 'ttf' | 'production' | 'eurusd';

export interface SharePriceSeries {
  companyId: string;
  ticker: string;
  currency: string;
  /** Daily closes, oldest first. */
  points: { date: string; close: number }[];
}

/** A transparent model: its coefficients, fit and uncertainty are always shown. */
export interface ScenarioModel {
  companyId: string;
  ticker: string;
  /** Monthly log share-price returns regressed on log changes of the drivers. */
  method: 'ols-monthly-log-returns';
  window: { start: Month; end: Month };
  observations: number;
  rSquared: number;
  /** Sensitivity of the share price to each driver (elasticities). */
  coefficients: Record<ScenarioDriver, number>;
  /** Standard errors of the coefficients. */
  standardErrors: Record<ScenarioDriver, number>;
  /** Monthly residual volatility (log), what the drivers do not explain. */
  residualVolMonthly: number;
  runAt: string;
  version: string;
}

export interface ScenarioResult {
  companyId: string;
  /** The parameters after clamping to the contract's ranges. */
  params: ScenarioParams;
  /** Modelled share-price change, % (median), and its 80% range. */
  medianPct: number;
  lowPct: number;
  highPct: number;
  /** Each driver's part of the median, in percentage points of log return. */
  contributions: Record<ScenarioDriver, number>;
  model: ScenarioModel;
}

export interface ParsedScenario {
  params: ScenarioParams;
  /** Which parameters the text actually set; the rest stay at their current values. */
  recognised: (keyof ScenarioParams)[];
}
