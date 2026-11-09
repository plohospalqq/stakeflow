/**
 * The ExtrasApi over the backend: forecasts, nowcasts, the prediction log, anomalies, prices,
 * share prices, scenarios and Ask. Same pattern as http.ts: generated wire types in, domain
 * models out, so pages never see a wire format. The static demo reuses these mappers over its
 * exported files (static.ts), so the two cannot drift apart.
 */
import { quarterOf } from '@/lib/dates';
import { titleCaseName } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safeUrl';
import { DRIVERS, fromContract, PARAM_KEYS, toContract } from '@/lib/scenario';
import type { JsonGetter, JsonPoster } from './http';
import type { components } from './schema.gen';
import type { ExtrasApi } from './source';
import type {
  Anomaly,
  AnomalyHit,
  AskReply,
  FieldForecast,
  LatestPrices,
  ModelCard,
  Nowcast,
  Prediction,
  PriceSeries,
} from './types';
import type {
  ParsedScenario,
  ScenarioDriver,
  ScenarioModel,
  ScenarioPreset,
  ScenarioResult,
  SharePriceSeries,
} from './types.scenario';

type Schemas = components['schemas'];

// --- forecasts and the prediction log ------------------------------------------------------

export function mapModelCard(c: Schemas['ModelCard']): ModelCard {
  return {
    status: c.status,
    method: c.method,
    b: c.b,
    initialDeclinePctPerYear: c.initialDeclinePctPerYear,
    fitWindow: c.fitWindow ? { start: c.fitWindow.start, end: c.fitWindow.end } : null,
    backtestErrorPct: c.backtestErrorPct,
    naiveErrorPct: c.naiveErrorPct,
    backtestCoveragePct: c.backtestCoveragePct,
    dataThrough: c.dataThrough,
    runAt: c.runAt,
    version: c.version,
  };
}

export function mapFieldForecast(f: Schemas['FieldForecast']): FieldForecast {
  return {
    fieldId: f.fieldId,
    points: f.points.map((p) => ({ month: p.month, p10: p.p10, p50: p.p50, p90: p.p90 })),
    model: mapModelCard(f.model),
    events: f.events.map((e) => ({ month: e.month, label: e.label })),
  };
}

export function mapNowcast(n: Schemas['Nowcast']): Nowcast {
  return {
    companyId: n.companyId,
    quarterStart: n.quarterStart,
    value: n.value,
    lo: n.lo,
    hi: n.hi,
    madeAt: n.madeAt,
    dataThrough: n.dataThrough,
    modelVersion: n.modelVersion,
    hash: n.hash,
    status: n.status,
    monthsInData: n.monthsInData,
    expectedReportOn: n.expectedReportOn,
    reportKind: n.reportKind,
  };
}

/** Where the freeze workflow commits a quarter's prediction (predictions/<YYYY>Q<n>/<id>.json). */
export function predictionFileUrl(quarterStart: string, companyId: string): string {
  const q = quarterOf(quarterStart);
  return `https://github.com/plohospalqq/stakeflow/blob/main/predictions/${q.year}Q${q.q}/${encodeURIComponent(companyId)}.json`;
}

/**
 * Only a live prediction frozen at (or after) its quarter's end is the one the quarter-end
 * workflow commits; earlier live runs are revisions of an open quarter and backtests are never
 * committed. A link the API sends itself wins, once it passes the URL allow-list.
 */
function commitUrl(r: Schemas['PredictionRecord']): string | null {
  const fromApi = safeExternalUrl(r.commitUrl);
  if (fromApi) return fromApi;
  if (r.kind !== 'live' || r.asOf < quarterOf(r.quarterStart).end) return null;
  return predictionFileUrl(r.quarterStart, r.companyId);
}

export function mapPrediction(r: Schemas['PredictionRecord']): Prediction {
  return {
    id: r.id,
    kind: r.kind,
    companyId: r.companyId,
    companyName: r.companyName,
    quarterStart: r.quarterStart,
    madeAt: r.madeAt,
    asOf: r.asOf,
    dataThrough: r.dataThrough,
    reportedOn: r.reportedOn,
    expectedReportOn: r.expectedReportOn,
    reportKind: r.reportKind,
    predicted: r.predicted,
    lo: r.lo,
    hi: r.hi,
    actual: r.actual,
    baseline: r.baseline,
    status: r.status,
    hash: r.hash,
    commitUrl: commitUrl(r),
    modelVersion: r.modelVersion,
  };
}

// --- anomalies -----------------------------------------------------------------------------

/** Focus companies first, then by the size of the effect. */
function sortHits(hits: AnomalyHit[]): AnomalyHit[] {
  return [...hits].sort(
    (a, b) => Number(b.isFocus) - Number(a.isFocus) || Math.abs(b.kboed) - Math.abs(a.kboed),
  );
}

export function mapAnomaly(a: Schemas['Anomaly']): Anomaly {
  return {
    id: a.id,
    fieldId: a.fieldId,
    // Sodir writes names in capitals; the rest of the UI title-cases them too.
    fieldName: titleCaseName(a.fieldName),
    operatorName: a.operatorName,
    month: a.month,
    pctVsExpected: a.pctVsExpected,
    severity: a.severity,
    status: a.status,
    note: a.note,
    expected: a.expected,
    actual: a.actual,
    series: a.series.map((p) => ({ ...p })),
    hits: sortHits(a.hits.map((h) => ({ ...h }))),
  };
}

// --- prices --------------------------------------------------------------------------------

/** Brent and TTF only; the API also serves the FX series, which no page draws. */
export function mapPriceSeries(s: Schemas['PriceSeries']): PriceSeries | null {
  if (s.id !== 'brent' && s.id !== 'ttf') return null;
  return {
    id: s.id,
    name: s.name,
    unit: s.unit,
    frequency: s.frequency,
    source: s.source,
    sourceUrl: safeExternalUrl(s.sourceUrl),
    licence: s.licence,
    attribution: s.attribution,
    points: s.points.map((p) => ({ date: p.date, value: p.value })),
  };
}

export function mapLatestPrices(p: Schemas['LatestPrices']): LatestPrices {
  return {
    asOf: p.asOf,
    brentUsdPerBbl: p.brentUsdPerBbl,
    brentDate: p.brentDate,
    ttfEurPerMwh: p.ttfEurPerMwh,
    ttfMonth: p.ttfMonth,
    eurUsd: p.eurUsd,
    eurUsdDate: p.eurUsdDate,
  };
}

export function mapSharePrices(s: Schemas['SharePriceSeries']): SharePriceSeries {
  return {
    companyId: s.companyId,
    ticker: s.ticker,
    currency: s.currency,
    note: s.note,
    points: s.points.map((p) => ({ date: p.date, close: p.close })),
  };
}

// --- scenarios -----------------------------------------------------------------------------

function isDriver(term: string): term is ScenarioDriver {
  return DRIVERS.some((d) => d === term);
}

export function mapScenarioModel(
  card: Schemas['ScenarioModelCard'],
  companyId: string,
  ticker: string,
): ScenarioModel {
  const coefficients: Record<ScenarioDriver, number> = {
    brent: 0,
    ttf: 0,
    production: 0,
    eurusd: 0,
  };
  const standardErrors: Record<ScenarioDriver, number> = { ...coefficients };
  for (const c of card.coefficients) {
    // The intercept is past drift; scenarios leave it out, so the page does too.
    if (!isDriver(c.term)) continue;
    coefficients[c.term] = c.estimate;
    standardErrors[c.term] = c.stdError;
  }
  const b = card.backtest;
  return {
    companyId,
    ticker,
    method: 'ols-monthly-log-returns',
    methodText: card.method,
    window: { start: card.windowStart, end: card.windowEnd },
    observations: card.nObs,
    rSquared: card.r2,
    adjRSquared: card.adjR2,
    coefficients,
    standardErrors,
    residualVolMonthly: card.residualSdMonthlyPct / 100,
    excludedMonths: Object.entries(card.excludedMonths)
      .map(([month, reason]) => ({ month, reason }))
      .sort((x, y) => x.month.localeCompare(y.month)),
    backtest: {
      quartersScored: b.quartersScored,
      rSquaredInSample: b.r2InSampleQuarterly,
      rSquaredOutOfSample: b.r2OutOfSampleQuarterly,
      bandCoverage80: b.bandCoverage80,
      note: b.note,
    },
    runAt: card.runAt,
    version: card.version,
  };
}

/** The backend's 80% band and central change are shown as they are, never recomputed here. */
export function mapScenario(r: Schemas['ScenarioResponse']): ScenarioResult {
  const contributions: Record<ScenarioDriver, number> = {
    brent: 0,
    ttf: 0,
    production: 0,
    eurusd: 0,
  };
  for (const c of r.contributions) contributions[c.driver] = c.contributionPct;
  return {
    companyId: r.companyId,
    params: fromContract(r.scenario),
    medianPct: r.changePct,
    lowPct: r.band80.loChangePct,
    highPct: r.band80.hiChangePct,
    contributions,
    price: {
      date: r.base.date,
      currency: r.currency,
      base: r.base.close,
      median: r.price,
      low: r.band80.loPrice,
      high: r.band80.hiPrice,
    },
    caveats: [...r.caveats],
    notice: r.notice,
    model: mapScenarioModel(r.model, r.companyId, r.ticker),
  };
}

export function mapPreset(p: Schemas['ScenarioPreset']): ScenarioPreset {
  return { id: p.id, name: p.name, description: p.description, params: fromContract(p.params) };
}

/**
 * The parser returns a complete scenario: whatever the text does not mention is "no change",
 * so every parameter counts as set and the sliders take all five.
 */
export function mapParsedScenario(p: Schemas['ScenarioParameters']): ParsedScenario {
  return {
    params: fromContract(p),
    recognised: [...PARAM_KEYS],
    assumptions: [...p.assumptions],
    companyId: p.company_id,
  };
}

// --- Ask -----------------------------------------------------------------------------------

export function mapAskAnswer(a: Schemas['AskAnswer']): AskReply {
  return {
    question: a.question,
    steps: a.steps.map((s) => ({ label: s.label, detail: s.detail })),
    answer: a.answer,
    sql: a.sql,
    durationMs: a.durationMs,
    columns: [...a.columns],
    rows: a.rows.map((row) => [...row]),
    chart: a.chart.map((c) => ({ label: c.label, value: c.value, previous: c.previous })),
    chartUnit: a.chartUnit,
    chartLegend: { current: a.chartLegend.current, previous: a.chartLegend.previous },
    followUps: [...a.followUps],
    matched: a.matched,
    preview: null,
  };
}

// --- client --------------------------------------------------------------------------------

/** Brent and TTF over the API's default window (the last 365 days). */
export const PRICE_SERIES = ['brent', 'ttf'];

const company = (id: string) => `/companies/${encodeURIComponent(id)}`;

/** Every extra over any source that answers API paths with API JSON (live API or static files). */
export function createExtras(get: JsonGetter, post: JsonPoster): ExtrasApi {
  return {
    async fieldForecast(id) {
      return mapFieldForecast(await get<Schemas['FieldForecast']>(`/fields/${id}/forecast`));
    },
    async nowcasts() {
      return (await get<Schemas['Nowcast'][]>('/nowcasts')).map(mapNowcast);
    },
    async predictionLog() {
      const rows = await get<Schemas['PredictionRecord'][]>('/predictions', { latest: true });
      return rows.map(mapPrediction);
    },
    async anomalies() {
      return (await get<Schemas['Anomaly'][]>('/anomalies', { limit: 500 })).map(mapAnomaly);
    },
    async prices() {
      const list = await get<Schemas['PriceSeries'][]>('/prices', { series: PRICE_SERIES });
      return list.map(mapPriceSeries).filter((s): s is PriceSeries => s !== null);
    },
    async latestPrices() {
      return mapLatestPrices(await get<Schemas['LatestPrices']>('/prices/latest'));
    },
    async ask(question) {
      return mapAskAnswer(await post<Schemas['AskAnswer']>('/ask', { question }));
    },
    async askTables() {
      const list = await get<Schemas['AskTable'][]>('/ask/tables');
      return list.map((t) => ({ name: t.name, description: t.description }));
    },
    async sharePrices(companyId) {
      return mapSharePrices(
        await get<Schemas['SharePriceSeries']>(`${company(companyId)}/share-price`),
      );
    },
    async scenarioPresets() {
      return (await get<Schemas['ScenarioPreset'][]>('/scenarios/presets')).map(mapPreset);
    },
    async runScenario(companyId, params) {
      return mapScenario(
        await get<Schemas['ScenarioResponse']>(`${company(companyId)}/scenario`, {
          ...toContract(params),
        }),
      );
    },
    async parseScenario(text, context) {
      const ref = context.reference;
      const body: Schemas['ScenarioParseRequest'] = {
        text,
        company_id: context.companyId,
        reference: ref
          ? { brent_usd: ref.brentUsd, ttf_eur_mwh: ref.ttfEurMwh, eurusd: ref.eurusd }
          : null,
      };
      return mapParsedScenario(await post<Schemas['ScenarioParameters']>('/scenarios/parse', body));
    },
  };
}
