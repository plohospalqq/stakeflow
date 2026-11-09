/**
 * The live-API mappers (extras.ts): wire types in, domain models out. Fixtures follow real
 * responses of the local API (Sodir data through Aug 2026), trimmed to what each test needs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createExtras,
  mapAnomaly,
  mapAskAnswer,
  mapFieldForecast,
  mapLatestPrices,
  mapNowcast,
  mapParsedScenario,
  mapPrediction,
  mapPreset,
  mapPriceSeries,
  mapScenario,
  mapSharePrices,
  predictionFileUrl,
} from '../extras';
import { ApiError, getJson, parseErrorBody, postJson, queryString } from '../http';
import { withAskPreview } from '../index';
import type { components } from '../schema.gen';
import type { ExtrasApi } from '../source';

type Schemas = components['schemas'];

afterEach(() => vi.unstubAllGlobals());

const modelCard = (over: Partial<Schemas['ModelCard']> = {}): Schemas['ModelCard'] => ({
  method: 'Flat at the last 3 months (on plateau, no decline to fit yet)',
  status: 'plateau',
  b: null,
  initialDeclinePctPerYear: null,
  diNominalPerYear: null,
  qiSm3PerDay: null,
  fitWindow: null,
  fitMonths: 0,
  seasonalSwingPct: 8.39,
  backtestErrorPct: 8.09,
  backtestBiasPct: 8.09,
  naiveErrorPct: 9.04,
  backtestCoveragePct: 91.67,
  runAt: '2026-11-09T12:29:06.346061Z',
  version: 'arps-1.0.0',
  dataThrough: '2026-08-01',
  ...over,
});

describe('mapFieldForecast', () => {
  it('keeps a plateau field without a curve: no b, no decline, no fit window', () => {
    const f = mapFieldForecast({
      fieldId: 26376286,
      points: [
        { month: '2026-08-01', p10: 3046501, p50: 3046501, p90: 3046501, isActual: true },
        { month: '2026-09-01', p10: 2819041.8, p50: 3097137, p90: 3302143.9, isActual: false },
      ],
      model: modelCard(),
      events: [],
    });
    expect(f.points[1]).toEqual({
      month: '2026-09-01',
      p10: 2819041.8,
      p50: 3097137,
      p90: 3302143.9,
    });
    expect(f.model).toMatchObject({
      status: 'plateau',
      b: null,
      initialDeclinePctPerYear: null,
      fitWindow: null,
      backtestErrorPct: 8.09,
      naiveErrorPct: 9.04,
      backtestCoveragePct: 91.67,
      dataThrough: '2026-08-01',
    });
  });

  it('keeps the curve of an Arps field and nulls on a field too young to backtest', () => {
    const f = mapFieldForecast({
      fieldId: 1,
      points: [],
      model: modelCard({
        status: 'arps',
        b: 0.62,
        initialDeclinePctPerYear: 14.2,
        fitWindow: { start: '2019-01-01', end: '2026-08-01' },
        backtestErrorPct: null,
        naiveErrorPct: null,
        backtestCoveragePct: null,
      }),
      events: [{ month: '2019-10-01', label: 'On stream' }],
    });
    expect(f.model.fitWindow).toEqual({ start: '2019-01-01', end: '2026-08-01' });
    expect(f.model.backtestErrorPct).toBeNull();
    expect(f.events).toEqual([{ month: '2019-10-01', label: 'On stream' }]);
  });
});

describe('mapNowcast', () => {
  it('passes the open quarter with its range and data cut-off', () => {
    const n = mapNowcast({
      companyId: 'aker-bp',
      companyName: 'Aker BP',
      quarterStart: '2026-10-01',
      value: 373.4,
      lo: 345.8,
      hi: 401.1,
      madeAt: '2026-11-09T12:22:39Z',
      dataThrough: '2026-08-01',
      monthsInData: 0,
      modelVersion: 'nowcast-1.0.0',
      hash: 'd93f229e',
      inputHash: '21db6a26',
      status: 'open',
      expectedReportOn: '2027-01-14',
      reportKind: 'trading update',
    });
    expect(n).toMatchObject({ value: 373.4, lo: 345.8, hi: 401.1, dataThrough: '2026-08-01' });
  });
});

const record = (over: Partial<Schemas['PredictionRecord']> = {}): Schemas['PredictionRecord'] => ({
  id: '55602cbe',
  companyId: 'aker-bp',
  companyName: 'Aker BP',
  quarterStart: '2023-01-01',
  kind: 'backtest',
  isLatest: true,
  madeAt: '2026-11-09T12:22:39Z',
  asOf: '2023-03-31',
  dataThrough: '2022-12-01',
  monthsInData: 0,
  predicted: 387.9,
  lo: 358.7,
  hi: 429.8,
  modelVersion: 'nowcast-1.0.0',
  status: 'resolved',
  expectedReportOn: '2023-04-14',
  reportKind: 'trading update',
  reportedOn: '2023-04-19',
  actual: 452.7,
  errorPct: -14.31,
  inRange: false,
  baseline: null,
  baselineErrorPct: null,
  attributedActual: 450.8,
  attributedErrorPct: -13.95,
  attributedInRange: false,
  attributedBaseline: 428.6,
  attributedBaselineErrorPct: -4.92,
  hash: 'e021bab4',
  inputHash: 'c8c2e7d9',
  commitUrl: null,
  ...over,
});

describe('mapPrediction', () => {
  it('keeps a backtest a backtest, with no baseline and no committed copy', () => {
    const p = mapPrediction(record());
    expect(p).toMatchObject({
      kind: 'backtest',
      asOf: '2023-03-31',
      baseline: null,
      actual: 452.7,
    });
    expect(p.commitUrl).toBeNull();
  });

  it('links a live prediction frozen at quarter end to its committed file', () => {
    const p = mapPrediction(
      record({ kind: 'live', quarterStart: '2026-10-01', asOf: '2026-12-31', status: 'open' }),
    );
    expect(p.commitUrl).toBe(
      'https://github.com/plohospalqq/stakeflow/blob/main/predictions/2026Q4/aker-bp.json',
    );
  });

  it('does not link a live update made during the quarter: only the quarter-end one is committed', () => {
    const p = mapPrediction(
      record({ kind: 'live', quarterStart: '2026-10-01', asOf: '2026-11-09', status: 'open' }),
    );
    expect(p.commitUrl).toBeNull();
  });

  it('prefers a link the API sends, but only one the allow-list accepts', () => {
    const own = 'https://github.com/plohospalqq/stakeflow/commit/abc123';
    expect(mapPrediction(record({ commitUrl: own })).commitUrl).toBe(own);
    expect(mapPrediction(record({ commitUrl: 'javascript:alert(1)' })).commitUrl).toBeNull();
  });

  it('builds the file path the freeze workflow writes', () => {
    expect(predictionFileUrl('2027-04-01', 'var-energi')).toBe(
      'https://github.com/plohospalqq/stakeflow/blob/main/predictions/2027Q2/var-energi.json',
    );
  });
});

describe('mapAnomaly', () => {
  const anomaly = (over: Partial<Schemas['Anomaly']> = {}): Schemas['Anomaly'] => ({
    id: 'a1',
    fieldId: 43506,
    fieldName: 'ORMEN LANGE',
    operatorName: null,
    month: '2026-08-01',
    pctVsExpected: -31,
    severity: 'high',
    status: 'new',
    note: 'Production 31% below expected.',
    expected: 140,
    actual: 97,
    series: [{ month: '2026-08-01', actual: 97, expected: 140, lo: 126, hi: 154 }],
    hits: [
      { companyId: 'shell', companyName: 'Shell', isFocus: false, sharePct: 17.8, kboed: -7.7 },
      { companyId: 'petoro', companyName: 'Petoro', isFocus: false, sharePct: 36.5, kboed: -15.7 },
      {
        companyId: 'equinor',
        companyName: 'Equinor (NCS only)',
        isFocus: true,
        sharePct: 25.3,
        kboed: -10.9,
      },
    ],
    ...over,
  });

  it('title-cases the field, keeps a missing operator missing, and puts focus owners first', () => {
    const a = mapAnomaly(anomaly());
    expect(a.fieldName).toBe('Ormen Lange');
    expect(a.operatorName).toBeNull();
    expect(a.hits.map((h) => h.companyId)).toEqual(['equinor', 'petoro', 'shell']);
    expect(a.hits[0]?.companyName).toBe('Equinor (NCS only)');
  });
});

describe('prices', () => {
  const series = (id: Schemas['PriceSeries']['id']): Schemas['PriceSeries'] => ({
    id,
    name: id === 'brent' ? 'Brent crude oil' : 'Gas',
    unit: id === 'brent' ? 'USD/bbl' : 'EUR/MWh',
    frequency: id === 'ttf' ? 'monthly' : 'daily',
    source: 'U.S. Energy Information Administration',
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/RBRTED.htm',
    licence: 'Public domain',
    attribution: 'Source: U.S. Energy Information Administration (EIA)',
    points: [{ date: '2026-11-03', value: 107.03 }],
  });

  it('keeps Brent and TTF with their frequency and attribution, and drops FX', () => {
    expect(mapPriceSeries(series('brent'))).toMatchObject({
      id: 'brent',
      frequency: 'daily',
      attribution: 'Source: U.S. Energy Information Administration (EIA)',
    });
    expect(mapPriceSeries(series('ttf'))?.frequency).toBe('monthly');
    expect(mapPriceSeries(series('eurusd'))).toBeNull();
  });

  it('maps the latest spot values, which may be missing before the first load', () => {
    expect(
      mapLatestPrices({
        kind: 'spot',
        asOf: '2026-11-09',
        brentUsdPerBbl: 107.03,
        brentDate: '2026-11-03',
        ttfEurPerMwh: null,
        ttfMonth: null,
        eurUsd: 1.1193,
        eurUsdDate: '2026-11-09',
        usdNok: 9.41,
        usdNokDate: '2026-11-09',
      }),
    ).toEqual({
      asOf: '2026-11-09',
      brentUsdPerBbl: 107.03,
      brentDate: '2026-11-03',
      ttfEurPerMwh: null,
      ttfMonth: null,
      eurUsd: 1.1193,
      eurUsdDate: '2026-11-09',
    });
  });

  it('maps share prices with their provenance note', () => {
    const s = mapSharePrices({
      companyId: 'aker-bp',
      companyName: 'Aker BP',
      ticker: 'AKRBP',
      isin: 'NO0010345853',
      exchange: 'Oslo Børs',
      currency: 'NOK',
      note: "Imported locally from the operator's own Euronext download. Not redistributed.",
      points: [{ date: '2026-11-06', close: 316.8, volume: null }],
    });
    expect(s.points).toEqual([{ date: '2026-11-06', close: 316.8 }]);
    expect(s.note).toMatch(/not redistributed/i);
  });
});

/** The Aker BP oil-crash answer of the local API (n = 20 monthly returns). */
const scenarioResponse = (): Schemas['ScenarioResponse'] => ({
  companyId: 'aker-bp',
  companyName: 'Aker BP',
  ticker: 'AKRBP',
  currency: 'NOK',
  scenario: {
    brent_change_pct: -30,
    ttf_change_pct: 0,
    production_change_pct: 0,
    eurusd_change_pct: 0,
    horizon_months: 3,
  },
  base: { date: '2026-11-06', close: 316.8 },
  changePct: -12.006,
  price: 278.76,
  band80: { loChangePct: -18.752, hiChangePct: -4.701, loPrice: 257.39, hiPrice: 301.91 },
  varianceFromCoefficients: 0.0016,
  path: [],
  contributions: [
    { driver: 'brent', inputChangePct: -30, coefficient: 0.3586, contributionPct: -12.006 },
    { driver: 'ttf', inputChangePct: 0, coefficient: 0.0646, contributionPct: 0 },
    { driver: 'production', inputChangePct: 0, coefficient: -0.2074, contributionPct: 0 },
    { driver: 'eurusd', inputChangePct: 0, coefficient: -0.5151, contributionPct: 0 },
  ],
  model: {
    version: 'share-scenario-0.1.0',
    runAt: '2026-11-09T18:19:42Z',
    method: 'Ordinary least squares on monthly log returns.',
    windowStart: '2025-01-01',
    windowEnd: '2026-08-01',
    nObs: 20,
    r2: 0.797,
    adjR2: 0.743,
    residualSdMonthlyPct: 3.138,
    coefficients: [
      { term: 'intercept', estimate: 0.0179, stdError: 0.008, tStat: 2.24, significant: true },
      { term: 'brent', estimate: 0.3586, stdError: 0.085, tStat: 4.22, significant: true },
      { term: 'ttf', estimate: 0.0646, stdError: 0.0861, tStat: 0.75, significant: false },
      { term: 'production', estimate: -0.2074, stdError: 0.1271, tStat: -1.63, significant: false },
      { term: 'eurusd', estimate: -0.5151, stdError: 0.6592, tStat: -0.78, significant: false },
    ],
    excludedMonths: { '2022-07-01': 'acquisition', '2022-06-01': 'acquisition' },
    backtest: {
      quartersScored: 2,
      r2InSampleQuarterly: 0.874,
      r2OutOfSampleQuarterly: null,
      bandCoverage80: null,
      note: 'Only 2 quarter(s) could be scored out of sample.',
      quarters: [],
    },
  },
  caveats: ['Fitted on only 20 months (Jan 2025 to Aug 2026).'],
  notice: 'Scenario, not a forecast; not investment advice.',
});

describe('mapScenario', () => {
  it("shows the backend's numbers as they are, never recomputed", () => {
    const r = mapScenario(scenarioResponse());
    expect(r.medianPct).toBe(-12.006);
    expect([r.lowPct, r.highPct]).toEqual([-18.752, -4.701]);
    expect(r.contributions).toEqual({ brent: -12.006, ttf: 0, production: 0, eurusd: 0 });
    expect(r.price).toEqual({
      date: '2026-11-06',
      currency: 'NOK',
      base: 316.8,
      median: 278.76,
      low: 257.39,
      high: 301.91,
    });
    expect(r.params).toMatchObject({ brentChangePct: -30, horizonMonths: 3 });
    expect(r.caveats).toHaveLength(1);
    expect(r.notice).toBe('Scenario, not a forecast; not investment advice.');
  });

  it('carries the fit, leaves out the intercept and turns the residual into a fraction', () => {
    const { model } = mapScenario(scenarioResponse());
    expect(model).toMatchObject({
      ticker: 'AKRBP',
      observations: 20,
      rSquared: 0.797,
      adjRSquared: 0.743,
      window: { start: '2025-01-01', end: '2026-08-01' },
      methodText: 'Ordinary least squares on monthly log returns.',
    });
    expect(model.coefficients).toEqual({
      brent: 0.3586,
      ttf: 0.0646,
      production: -0.2074,
      eurusd: -0.5151,
    });
    expect(model.standardErrors.brent).toBe(0.085);
    expect(model.residualVolMonthly).toBeCloseTo(0.03138, 6);
    expect(model.excludedMonths.map((x) => x.month)).toEqual(['2022-06-01', '2022-07-01']);
    expect(model.backtest).toMatchObject({
      quartersScored: 2,
      rSquaredOutOfSample: null,
      bandCoverage80: null,
    });
  });

  it('reads presets and parsed text in the contract form', () => {
    expect(
      mapPreset({
        id: 'oil-crash',
        name: 'Oil crash: Brent −30%',
        description: 'Brent falls by almost a third.',
        params: {
          brent_change_pct: -30,
          ttf_change_pct: 0,
          production_change_pct: 0,
          eurusd_change_pct: 0,
          horizon_months: 3,
        },
      }).params,
    ).toEqual({
      brentChangePct: -30,
      ttfChangePct: 0,
      productionChangePct: 0,
      eurusdChangePct: 0,
      horizonMonths: 3,
    });
    const parsed = mapParsedScenario({
      brent_change_pct: -15.9,
      ttf_change_pct: 0,
      production_change_pct: 0,
      eurusd_change_pct: 0,
      horizon_months: 6,
      assumptions: ['Brent at $90 from $107.03 today is −15.9%.'],
      company_id: 'equinor',
    });
    expect(parsed.params.brentChangePct).toBe(-15.9);
    expect(parsed.recognised).toHaveLength(5);
    expect(parsed.companyId).toBe('equinor');
    expect(parsed.assumptions).toHaveLength(1);
  });
});

describe('mapAskAnswer', () => {
  it('keeps SQL NULLs as null and marks the answer as the real thing', () => {
    const a = mapAskAnswer({
      question: 'Top fields',
      steps: [{ label: 'Wrote SQL', detail: '1 query' }],
      answer: 'Johan Sverdrup leads.',
      sql: 'select 1',
      durationMs: 12,
      columns: ['field', 'kboe_d'],
      rows: [
        ['Johan Sverdrup', 700],
        ['Tyrving', null],
      ],
      chart: [{ label: 'Johan Sverdrup', value: 700, previous: null }],
      chartUnit: 'kboe/d',
      chartLegend: { current: '2025', previous: null },
      followUps: [],
      matched: true,
      chartType: 'bar',
      truncated: false,
    });
    expect(a.rows[1]).toEqual(['Tyrving', null]);
    expect(a.preview).toBeNull();
  });
});

describe('the HTTP layer for extras', () => {
  it('repeats list parameters, as FastAPI expects', () => {
    expect(queryString({ series: ['brent', 'ttf'], start: undefined })).toBe(
      '?series=brent&series=ttf',
    );
    expect(queryString({})).toBe('');
  });

  it("reads FastAPI's error bodies, structured or plain", () => {
    expect(parseErrorBody({ detail: { code: 'llm_not_configured', message: 'No key.' } })).toEqual({
      code: 'llm_not_configured',
      detail: 'No key.',
    });
    expect(parseErrorBody({ detail: 'No scenario model yet' })).toEqual({
      code: null,
      detail: 'No scenario model yet',
    });
    expect(parseErrorBody([{ loc: ['query'] }])).toEqual({ code: null, detail: null });
  });

  it('sends the parser the company and the reference levels in the contract names', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          brent_change_pct: -15.9,
          ttf_change_pct: 0,
          production_change_pct: 0,
          eurusd_change_pct: 0,
          horizon_months: 3,
          assumptions: [],
          company_id: null,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createExtras(getJson, postJson).parseScenario('oil at $90', {
      companyId: 'aker-bp',
      reference: { brentUsd: 107.03, ttfEurMwh: 86.8, eurusd: 1.1193 },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/scenarios/parse');
    expect(init).toMatchObject({ method: 'POST' });
    const body = init?.body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({
      text: 'oil at $90',
      company_id: 'aker-bp',
      reference: { brent_usd: 107.03, ttf_eur_mwh: 86.8, eurusd: 1.1193 },
    });
  });

  it('turns a 503 into an ApiError with the reason code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: { code: 'llm_not_configured', message: 'No key.' } }),
            { status: 503 },
          ),
        ),
    );
    const error: unknown = await postJson('/ask', { question: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'llm_not_configured' });
  });
});

describe('withAskPreview', () => {
  const failing = (error: Error): ExtrasApi => {
    const api = createExtras(getJson, postJson);
    return { ...api, ask: () => Promise.reject(error) };
  };

  it('answers with a prepared example and says the AI is off when the server has no key', async () => {
    const api = withAskPreview(failing(new ApiError(503, '/ask', 'llm_not_configured')));
    const answer = await api.ask('Top 10 gas fields in 2025');
    expect(answer).toMatchObject({ matched: true, preview: 'aiOff' });
  });

  it('stops asking a server without a key', async () => {
    const ask = vi.fn<ExtrasApi['ask']>(() =>
      Promise.reject(new ApiError(503, '/ask', 'llm_not_configured')),
    );
    const api = withAskPreview({ ...createExtras(getJson, postJson), ask });
    await api.ask('Top 10 gas fields in 2025');
    expect((await api.ask('Who owns the most of Johan Castberg?')).preview).toBe('aiOff');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('says the AI is unavailable for any other 503', async () => {
    const api = withAskPreview(failing(new ApiError(503, '/ask', 'reader_unavailable')));
    expect((await api.ask('Top 10 gas fields in 2025')).preview).toBe('unavailable');
  });

  it('lets every other error through', async () => {
    const api = withAskPreview(failing(new ApiError(500, '/ask')));
    await expect(api.ask('Top 10 gas fields in 2025')).rejects.toMatchObject({ status: 500 });
  });
});
