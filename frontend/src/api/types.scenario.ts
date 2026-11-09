/**
 * The what-if scenario explorer. The parameter contract mirrors the backend's
 * {brent_change_pct, ttf_change_pct, production_change_pct, eurusd_change_pct,
 * horizon_months} in camelCase; lib/scenario.ts maps between the two and clamps ranges.
 * Live mode reads the backend's model; the static demo and mocks use sample models, because
 * the real ones are fitted on Euronext prices that may not be redistributed.
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
  /** Where the prices come from, from the backend (English); null for sample data. */
  note: string | null;
  /** Daily closes, oldest first. Empty when no prices were imported in this installation. */
  points: { date: string; close: number }[];
}

/** How well the drivers explain each quarter's share move (not foresight). */
export interface ScenarioBacktest {
  quartersScored: number;
  rSquaredInSample: number | null;
  /** Only reported from 4 out-of-sample quarters. */
  rSquaredOutOfSample: number | null;
  /** Share of out-of-sample quarters inside the 80% band, 0…1. */
  bandCoverage80: number | null;
  /** The backend's explanation (English). */
  note: string;
}

/** A transparent model: its coefficients, fit and uncertainty are always shown. */
export interface ScenarioModel {
  companyId: string;
  ticker: string;
  /** Monthly log share-price returns regressed on log changes of the drivers. */
  method: 'ols-monthly-log-returns';
  /** The backend's description of the method (English); null for the sample model. */
  methodText: string | null;
  window: { start: Month; end: Month };
  observations: number;
  rSquared: number;
  adjRSquared: number | null;
  /** Sensitivity of the share price to each driver (elasticities). */
  coefficients: Record<ScenarioDriver, number>;
  /** Standard errors of the coefficients. */
  standardErrors: Record<ScenarioDriver, number>;
  /** Monthly residual volatility (log), what the drivers do not explain. */
  residualVolMonthly: number;
  /** Months left out of the fit, with the reason (acquisitions, for example). */
  excludedMonths: { month: Month; reason: string }[];
  backtest: ScenarioBacktest | null;
  runAt: string;
  version: string;
}

export interface ScenarioResult {
  companyId: string;
  /** The parameters after clamping to the contract's ranges. */
  params: ScenarioParams;
  /** Modelled share-price change, % (central), and its 80% range. */
  medianPct: number;
  lowPct: number;
  highPct: number;
  /**
   * The change each driver alone would cause, %: (exp(β·ln(1 + change)) − 1) × 100. They
   * combine by multiplying, so they add up to the total only approximately.
   */
  contributions: Record<ScenarioDriver, number>;
  /** The same changes applied to the last close; null without a share price. */
  price: {
    date: string;
    currency: string;
    base: number;
    median: number;
    low: number;
    high: number;
  } | null;
  /** Warnings from the model (short window, extrapolation, weak drivers); English. */
  caveats: string[];
  /** The backend's notice (English); null for the sample model. */
  notice: string | null;
  model: ScenarioModel;
}

export interface ScenarioPreset {
  id: string;
  /** The backend's name and description (English); the UI shows its own words for known ids. */
  name: string;
  description: string;
  params: ScenarioParams;
}

/** What the free-text parser gets besides the text, so it can turn "$90" into a %. */
export interface ParseContext {
  companyId: string;
  reference: { brentUsd: number | null; ttfEurMwh: number | null; eurusd: number | null } | null;
}

export interface ParsedScenario {
  params: ScenarioParams;
  /** Which parameters the text set; the rest stay at their current values. */
  recognised: (keyof ScenarioParams)[];
  /** How the numbers were worked out, step by step (English); empty for the sample parser. */
  assumptions: string[];
  /** The company the text named, if any. */
  companyId: string | null;
}
