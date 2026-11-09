/**
 * Sample data for the scenario explorer: share prices, a fitted model per company, the
 * model's answer, the ready-made scenarios and a free-text parser. The live API serves the
 * same shapes; the static demo and mocks mode use these, badged as sample data, because the
 * real model is fitted on Euronext prices that may not be redistributed.
 *
 * The parser stands in for the LLM step: it only turns words into the five parameters
 * (never a result), in English, Ukrainian or Norwegian.
 */
import { addDays } from '@/lib/dates';
import { seededRandom } from '@/lib/random';
import { clampScenario, modelScenario, NEUTRAL_SCENARIO } from '@/lib/scenario';
import { ApiError } from '../http';
import type { ExtrasApi } from '../source';
import type {
  ParsedScenario,
  ScenarioModel,
  ScenarioParams,
  ScenarioPreset,
  ScenarioResult,
  SharePriceSeries,
} from '../types.scenario';

const MODEL_RUN_AT = '2026-11-02T04:00:00Z';
const PRICE_END = '2026-11-06';
const TRADING_DAYS = 2 * 252;

interface CompanySeed {
  ticker: string;
  lastClose: number;
  dailyVol: number;
  model: Pick<
    ScenarioModel,
    | 'window'
    | 'observations'
    | 'rSquared'
    | 'coefficients'
    | 'standardErrors'
    | 'residualVolMonthly'
  >;
}

// Sample coefficients in a plausible range for NCS producers; not fitted to real prices.
const SEEDS: Record<string, CompanySeed> = {
  'aker-bp': {
    ticker: 'AKRBP',
    lastClose: 243.6,
    dailyVol: 0.018,
    model: {
      window: { start: '2019-01-01', end: '2026-10-01' },
      observations: 94,
      rSquared: 0.41,
      coefficients: { brent: 0.28, ttf: 0.04, production: 0.55, eurusd: -0.3 },
      standardErrors: { brent: 0.06, ttf: 0.03, production: 0.21, eurusd: 0.14 },
      residualVolMonthly: 0.062,
    },
  },
  'var-energi': {
    ticker: 'VAR',
    lastClose: 33.9,
    dailyVol: 0.02,
    model: {
      // Listed on Oslo Børs in February 2022: a shorter window, said on screen.
      window: { start: '2022-03-01', end: '2026-10-01' },
      observations: 56,
      rSquared: 0.36,
      coefficients: { brent: 0.3, ttf: 0.09, production: 0.6, eurusd: -0.25 },
      standardErrors: { brent: 0.08, ttf: 0.04, production: 0.26, eurusd: 0.17 },
      residualVolMonthly: 0.071,
    },
  },
  equinor: {
    ticker: 'EQNR',
    lastClose: 251.2,
    dailyVol: 0.016,
    model: {
      window: { start: '2019-01-01', end: '2026-10-01' },
      observations: 94,
      rSquared: 0.48,
      coefficients: { brent: 0.24, ttf: 0.16, production: 0.25, eurusd: -0.2 },
      standardErrors: { brent: 0.05, ttf: 0.04, production: 0.18, eurusd: 0.12 },
      residualVolMonthly: 0.055,
    },
  },
};

function seedFor(companyId: string): CompanySeed {
  const seed = SEEDS[companyId];
  if (!seed) throw new ApiError(404, `/scenarios/${companyId}`);
  return seed;
}

function modelFor(companyId: string): ScenarioModel {
  const seed = seedFor(companyId);
  return {
    companyId,
    ticker: seed.ticker,
    method: 'ols-monthly-log-returns',
    methodText: null,
    adjRSquared: null,
    excludedMonths: [],
    backtest: null,
    runAt: MODEL_RUN_AT,
    version: 'scenario-0.1.0',
    ...seed.model,
  };
}

/** The backend's ready-made scenarios, same ids and numbers, so links work in every mode. */
export const SAMPLE_PRESETS: ScenarioPreset[] = [
  {
    id: 'calm-year',
    name: 'Calm year: everything flat',
    description: 'Oil, gas, production and the dollar stay where they are for a year.',
    params: { ...NEUTRAL_SCENARIO, horizonMonths: 12 },
  },
  {
    id: 'oil-crash',
    name: 'Oil crash: Brent −30%',
    description: 'Brent falls by almost a third within three months.',
    params: { ...NEUTRAL_SCENARIO, brentChangePct: -30, horizonMonths: 3 },
  },
  {
    id: 'oil-rally',
    name: 'Oil rally: Brent +30%',
    description: 'Brent rises by almost a third within three months.',
    params: { ...NEUTRAL_SCENARIO, brentChangePct: 30, horizonMonths: 3 },
  },
  {
    id: 'gas-spike',
    name: 'Gas spike: TTF +50%',
    description: 'European gas prices jump by half within three months.',
    params: { ...NEUTRAL_SCENARIO, ttfChangePct: 50, horizonMonths: 3 },
  },
  {
    id: 'sverdrup-outage',
    name: 'Johan Sverdrup outage: production −10% for a quarter',
    description: 'The company produces 10% less over the next three months.',
    params: { ...NEUTRAL_SCENARIO, productionChangePct: -10, horizonMonths: 3 },
  },
  {
    id: 'strong-dollar',
    name: 'Strong dollar: EUR/USD −10%',
    description: 'The US dollar strengthens by about a tenth against the euro over six months.',
    params: { ...NEUTRAL_SCENARIO, eurusdChangePct: -10, horizonMonths: 6 },
  },
];

function tradingDays(end: string, count: number): string[] {
  const days: string[] = [];
  for (let d = end; days.length < count; d = addDays(d, -1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days.reverse();
}

function sharePrices(companyId: string): SharePriceSeries {
  const seed = seedFor(companyId);
  const days = tradingDays(PRICE_END, TRADING_DAYS);
  const rand = seededRandom(`share-${companyId}`);
  const closes = new Array<number>(days.length);
  closes[days.length - 1] = seed.lastClose;
  for (let i = days.length - 2; i >= 0; i--) {
    const shock = (rand() + rand() + rand() - 1.5) * seed.dailyVol * 2;
    closes[i] = (closes[i + 1] ?? seed.lastClose) / Math.exp(shock);
  }
  return {
    companyId,
    ticker: seed.ticker,
    currency: 'NOK',
    note: null,
    points: days.map((date, i) => ({
      date,
      close: Math.round((closes[i] ?? seed.lastClose) * 100) / 100,
    })),
  };
}

// --- free-text parser (stand-in for the LLM) --------------------------------------------

const DRIVER_WORDS: { key: keyof ScenarioParams; words: RegExp }[] = [
  { key: 'brentChangePct', words: /\b(oil|brent|crude)|нафт|olje|oljepris/i },
  { key: 'ttfChangePct', words: /\b(gas|ttf)\b|газ|gass/i },
  { key: 'productionChangePct', words: /production|output|видобут|виробництв|produksjon/i },
  { key: 'eurusdChangePct', words: /dollar|euro|eur\b|usd|долар|євро|dollaren|euroen/i },
];
const DOWN_WORDS =
  /fall|drop|down|lower|decline|crash|cut|weaker|падін|впад|знизи|зниж|скороч|слабш|faller|fall|ned|lavere|svakere|kutt/i;
const PERCENT = /([+\-−]?\s?\d+(?:[.,]\d+)?)\s*(?:%|per ?cent|відсот|prosent)/i;
const MONTHS = /(\d+)\s*(?:months?|міс|måned)/i;

function parseText(text: string, current: ScenarioParams): ParsedScenario {
  const recognised: (keyof ScenarioParams)[] = [];
  const next: ScenarioParams = { ...current };
  // One clause per driver: split on punctuation and "and" in the three languages.
  const clauses = text.split(/[,;.\n]|\band\b|\bі\b|\bта\b|\bog\b/i);
  for (const clause of clauses) {
    const driver = DRIVER_WORDS.find((d) => d.words.test(clause));
    const pct = PERCENT.exec(clause);
    if (!driver || !pct?.[1]) continue;
    const raw = pct[1].replace(/\s/g, '').replace('−', '-').replace(',', '.');
    let value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (!/^[+-]/.test(raw) && DOWN_WORDS.test(clause)) value = -value;
    // "a weaker dollar" means the euro buys more dollars.
    if (
      driver.key === 'eurusdChangePct' &&
      /dollar|долар/i.test(clause) &&
      !/euro|євро/i.test(clause)
    ) {
      value = -value;
    }
    next[driver.key] = value;
    recognised.push(driver.key);
  }
  const months = MONTHS.exec(text);
  if (months?.[1]) {
    next.horizonMonths = Number(months[1]);
    recognised.push('horizonMonths');
  }
  return { params: clampScenario(next), recognised, assumptions: [], companyId: null };
}

function runScenario(companyId: string, params: ScenarioParams): ScenarioResult {
  const seed = seedFor(companyId);
  const core = modelScenario(modelFor(companyId), params);
  const at = (changePct: number) => seed.lastClose * (1 + changePct / 100);
  return {
    companyId,
    ...core,
    price: {
      date: PRICE_END,
      currency: 'NOK',
      base: seed.lastClose,
      median: at(core.medianPct),
      low: at(core.lowPct),
      high: at(core.highPct),
    },
    caveats: [],
    notice: null,
  };
}

export const mockScenarioApi: Pick<
  ExtrasApi,
  'sharePrices' | 'scenarioPresets' | 'runScenario' | 'parseScenario'
> = {
  sharePrices: async (companyId) => sharePrices(companyId),
  scenarioPresets: async () => SAMPLE_PRESETS,
  runScenario: async (companyId, params) => runScenario(companyId, params),
  // Unrecognised parameters come back neutral; the UI applies only the recognised ones.
  parseScenario: async (text) => parseText(text, NEUTRAL_SCENARIO),
};
