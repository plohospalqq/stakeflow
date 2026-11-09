/**
 * Scenario contract helpers: ranges, clamping, the snake_case wire names the backend uses,
 * and the model's arithmetic for the sample model. The arithmetic follows the backend's
 * (api/src/stakeflow_api/scenario.py) so the sample explains the same thing the real model
 * does; with the live API the page shows the backend's numbers and never recomputes them.
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

/** Nothing changes over the backend's default horizon of three months. */
export const NEUTRAL_SCENARIO: ScenarioParams = {
  brentChangePct: 0,
  ttfChangePct: 0,
  productionChangePct: 0,
  eurusdChangePct: 0,
  horizonMonths: 3,
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

/** z for a two-sided 80% interval (same constant as the backend). */
const Z80 = 1.2815515655446004;

/** ln(1 + pct/100). −100% is computed as −99%, as the backend does: a log cannot reach zero. */
function logChange(pct: number): number {
  return Math.log(Math.max(0.01, 1 + pct / 100));
}

const pct = (logReturn: number) => (Math.exp(logReturn) - 1) * 100;

export type ScenarioCore = Pick<
  ScenarioResult,
  'params' | 'medianPct' | 'lowPct' | 'highPct' | 'contributions' | 'model'
>;

/**
 * The model's answer to a scenario. Central change: Σ β·ln(1 + change), no drift. 80% range:
 * coefficient uncertainty for these changes plus the residual volatility over the horizon,
 * which is why longer horizons get wider bands. The sample model has no covariance matrix, so
 * it treats the coefficients as independent; the backend uses the full matrix (x′ Cov(b) x).
 */
export function modelScenario(model: ScenarioModel, input: ScenarioParams): ScenarioCore {
  const params = clampScenario(input);
  const x = (d: ScenarioDriver) => logChange(params[DRIVER_PARAM[d]]);
  const term = (d: ScenarioDriver) => model.coefficients[d] * x(d);
  // What each driver alone would do; they combine by multiplying, as the backend reports them.
  const contributions: Record<ScenarioDriver, number> = {
    brent: pct(term('brent')),
    ttf: pct(term('ttf')),
    production: pct(term('production')),
    eurusd: pct(term('eurusd')),
  };
  const median = DRIVERS.reduce((s, d) => s + term(d), 0);
  const paramVar = DRIVERS.reduce((s, d) => s + (model.standardErrors[d] * x(d)) ** 2, 0);
  const sigma = Math.sqrt(paramVar + model.residualVolMonthly ** 2 * params.horizonMonths);
  return {
    params,
    medianPct: pct(median),
    lowPct: pct(median - Z80 * sigma),
    highPct: pct(median + Z80 * sigma),
    contributions,
    model,
  };
}

/** |t| ≥ 2: the backend's line between a sensitivity and noise. */
export function isSignificant(model: ScenarioModel, driver: ScenarioDriver): boolean {
  const se = model.standardErrors[driver];
  return se > 0 && Math.abs(model.coefficients[driver] / se) >= 2;
}
