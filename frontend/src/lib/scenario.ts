/**
 * Scenario contract helpers: ranges, clamping, the snake_case wire names the backend uses,
 * and the model's arithmetic. The arithmetic is here (not only in the backend) so the UI can
 * print every step and the mock computes exactly what the screen explains.
 */
import type {
  ScenarioDriver,
  ScenarioModel,
  ScenarioParams,
  ScenarioResult,
} from '@/api/types.scenario';

export const SCENARIO_LIMITS: Record<keyof ScenarioParams, { min: number; max: number }> = {
  brentChangePct: { min: -90, max: 300 },
  ttfChangePct: { min: -90, max: 300 },
  productionChangePct: { min: -100, max: 100 },
  eurusdChangePct: { min: -50, max: 100 },
  horizonMonths: { min: 1, max: 24 },
};

export const PARAM_KEYS: (keyof ScenarioParams)[] = [
  'brentChangePct',
  'ttfChangePct',
  'productionChangePct',
  'eurusdChangePct',
  'horizonMonths',
];

export const NEUTRAL_SCENARIO: ScenarioParams = {
  brentChangePct: 0,
  ttfChangePct: 0,
  productionChangePct: 0,
  eurusdChangePct: 0,
  horizonMonths: 6,
};

/** Wire names of the backend contract. */
export interface ScenarioContract {
  brent_change_pct: number;
  ttf_change_pct: number;
  production_change_pct: number;
  eurusd_change_pct: number;
  horizon_months: number;
}

function clampOne(key: keyof ScenarioParams, value: number | undefined): number {
  const { min, max } = SCENARIO_LIMITS[key];
  const v = value === undefined || !Number.isFinite(value) ? NEUTRAL_SCENARIO[key] : value;
  const clamped = Math.min(max, Math.max(min, v));
  // Months are whole; percentages keep one decimal.
  return key === 'horizonMonths' ? Math.round(clamped) : Math.round(clamped * 10) / 10;
}

/** Any partial or out-of-range input → a valid scenario (missing = neutral). */
export function clampScenario(input: Partial<ScenarioParams>): ScenarioParams {
  return {
    brentChangePct: clampOne('brentChangePct', input.brentChangePct),
    ttfChangePct: clampOne('ttfChangePct', input.ttfChangePct),
    productionChangePct: clampOne('productionChangePct', input.productionChangePct),
    eurusdChangePct: clampOne('eurusdChangePct', input.eurusdChangePct),
    horizonMonths: clampOne('horizonMonths', input.horizonMonths),
  };
}

export function toContract(p: ScenarioParams): ScenarioContract {
  const c = clampScenario(p);
  return {
    brent_change_pct: c.brentChangePct,
    ttf_change_pct: c.ttfChangePct,
    production_change_pct: c.productionChangePct,
    eurusd_change_pct: c.eurusdChangePct,
    horizon_months: c.horizonMonths,
  };
}

export function fromContract(c: Partial<ScenarioContract>): ScenarioParams {
  return clampScenario({
    brentChangePct: c.brent_change_pct,
    ttfChangePct: c.ttf_change_pct,
    productionChangePct: c.production_change_pct,
    eurusdChangePct: c.eurusd_change_pct,
    horizonMonths: c.horizon_months,
  });
}

const DRIVER_PARAM: Record<ScenarioDriver, keyof ScenarioParams> = {
  brent: 'brentChangePct',
  ttf: 'ttfChangePct',
  production: 'productionChangePct',
  eurusd: 'eurusdChangePct',
};

export const DRIVERS: ScenarioDriver[] = ['brent', 'ttf', 'production', 'eurusd'];

/** z for a two-sided 80% interval. */
const Z80 = 1.2816;

/** log(1 + pct/100), with −100% kept finite (a full stop is a 99.9% fall, not −∞). */
function logChange(pct: number): number {
  return Math.log(Math.max(0.001, 1 + pct / 100));
}

/**
 * The model's answer to a scenario. Median: Σ β·log(1+change). 80% range: coefficient
 * uncertainty for these changes plus the residual volatility over the horizon, which is
 * why longer horizons get wider bands.
 */
export function modelScenario(
  model: ScenarioModel,
  input: ScenarioParams,
): Omit<ScenarioResult, 'companyId'> {
  const params = clampScenario(input);
  const x = (d: ScenarioDriver) => logChange(params[DRIVER_PARAM[d]]);
  const term = (d: ScenarioDriver) => model.coefficients[d] * x(d);
  const contributions: Record<ScenarioDriver, number> = {
    brent: term('brent') * 100,
    ttf: term('ttf') * 100,
    production: term('production') * 100,
    eurusd: term('eurusd') * 100,
  };
  const median = DRIVERS.reduce((s, d) => s + term(d), 0);
  const paramVar = DRIVERS.reduce((s, d) => s + (model.standardErrors[d] * x(d)) ** 2, 0);
  const sigma = Math.sqrt(paramVar + model.residualVolMonthly ** 2 * params.horizonMonths);
  const pct = (logReturn: number) => (Math.exp(logReturn) - 1) * 100;
  return {
    params,
    medianPct: pct(median),
    lowPct: pct(median - Z80 * sigma),
    highPct: pct(median + Z80 * sigma),
    contributions,
    model,
  };
}
