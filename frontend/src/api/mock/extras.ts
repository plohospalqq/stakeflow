/**
 * Sample data for what the backend does not serve yet: forecasts, nowcasts, the
 * prediction log, anomalies, prices and Ask answers. Deterministic, and anchored to the
 * active core data where that keeps charts continuous (a forecast starts where the real
 * history ends). Everything here is shown with a "Sample data" badge.
 */
import { arpsRate } from '@/lib/arps';
import { addDays, addMonths, daysInMonth, monthRange, quarterMonths, quarterOf } from '@/lib/dates';
import { titleCaseName } from '@/lib/format';
import { sampleHash, seededRandom } from '@/lib/random';
import type { CoreApi, ExtrasApi } from '../source';
import type {
  Anomaly,
  AnomalyStatus,
  FieldForecast,
  Forecast,
  Nowcast,
  Prediction,
  PriceSeries,
  Severity,
} from '../types';
import { answerQuestion } from './ask';
import { FOCUS_IDS } from './core';
import { SEED_FIELDS, SEED_GROUPS } from './seedFields';

const MODEL_RUN_AT = '2026-11-02T04:00:00Z';
const FORECAST_MONTHS = 36;

/** Public milestones worth marking on a field chart. */
const FIELD_EVENTS: Record<number, { month: string; label: string }[]> = {
  26376286: [{ month: '2022-12-01', label: 'Phase 2 on stream' }],
  32017325: [{ month: '2025-03-01', label: 'First oil' }],
  42148955: [{ month: '2025-03-01', label: 'Production start' }],
};

const COMPANY_NAMES: Record<string, string> = {
  'aker-bp': 'Aker BP',
  'var-energi': 'Vår Energi',
  equinor: 'Equinor (NCS only)',
};

/**
 * When each company publishes quarterly production (docs/nowcast-feasibility.md):
 * trading updates at T+12 (Vår Energi) and T+14 (Aker BP). Equinor has no trading
 * update; its Norway segment comes with the quarterly report, roughly a month after.
 */
export const REPORTING: Record<string, { lagDays: number; kind: Nowcast['reportKind'] }> = {
  'var-energi': { lagDays: 12, kind: 'trading update' },
  'aker-bp': { lagDays: 14, kind: 'trading update' },
  equinor: { lagDays: 30, kind: 'quarterly report' },
};

const OPEN_QUARTER = '2026-10-01';

const OPEN_NOWCASTS: Record<string, [number, number, number]> = {
  'aker-bp': [381.0, 369.0, 393.0],
  'var-energi': [372.0, 358.0, 386.0],
  equinor: [1452.0, 1405.0, 1499.0],
};

/**
 * Quarterly production the companies reported, kboe/d. Q3 2025 (Vår), Q2 and Q3 2026
 * (both) match the real trading updates the API knows; the rest are sample values.
 */
const ACTUALS: Record<string, number[]> = {
  // Q4 2024 (baseline only), Q1 2025 … Q3 2026
  'aker-bp': [449.0, 438.5, 413.2, 411.4, 410.0, 398.9, 383.6, 374.3],
  'var-energi': [300.1, 265.0, 283.4, 370.0, 390.2, 401.5, 376.0, 369.0],
  equinor: [1410.0, 1398.0, 1370.0, 1425.0, 1476.0, 1522.0, 1420.0, 1470.0],
};
const FIRST_LOG_QUARTER = '2024-10-01';

function quarterEnd(quarterStart: string): string {
  return quarterOf(quarterStart).end;
}

function reportDate(companyId: string, quarterStart: string): string {
  return addDays(quarterEnd(quarterStart), REPORTING[companyId]?.lagDays ?? 30);
}

function predictionLog(): Prediction[] {
  const rows: Prediction[] = [];
  for (const companyId of ['aker-bp', 'var-energi', 'equinor']) {
    const actuals = ACTUALS[companyId] ?? [];
    const rand = seededRandom(`log-${companyId}`);
    for (let i = 1; i < actuals.length; i++) {
      const quarterStart = addMonths(FIRST_LOG_QUARTER, i * 3);
      const actual = actuals[i] ?? 0;
      const error = (rand() + rand() + rand() - 1.5) * 0.017;
      const predicted = Math.round(actual * (1 + error) * 10) / 10;
      const id = `${companyId}-${quarterStart}`;
      rows.push({
        id,
        companyId,
        companyName: COMPANY_NAMES[companyId] ?? companyId,
        quarterStart,
        madeAt: `${quarterEnd(quarterStart)}T23:59:00Z`,
        reportedOn: reportDate(companyId, quarterStart),
        expectedReportOn: reportDate(companyId, quarterStart),
        predicted,
        lo: Math.round(predicted * 0.97 * 10) / 10,
        hi: Math.round(predicted * 1.03 * 10) / 10,
        actual,
        baseline: actuals[i - 1] ?? actual,
        status: 'resolved',
        hash: sampleHash(id),
        commitUrl: null,
        modelVersion: i < 4 ? 'nowcast-0.1.0' : 'nowcast-0.2.0',
      });
    }
    const [value, lo, hi] = OPEN_NOWCASTS[companyId] ?? [0, 0, 0];
    const id = `${companyId}-${OPEN_QUARTER}`;
    rows.push({
      id,
      companyId,
      companyName: COMPANY_NAMES[companyId] ?? companyId,
      quarterStart: OPEN_QUARTER,
      madeAt: MODEL_RUN_AT,
      reportedOn: null,
      expectedReportOn: reportDate(companyId, OPEN_QUARTER),
      predicted: value,
      lo,
      hi,
      actual: null,
      baseline: actuals[actuals.length - 1] ?? value,
      status: 'open',
      hash: sampleHash(id),
      commitUrl: null,
      modelVersion: 'nowcast-0.2.0',
    });
  }
  return rows;
}

interface AnomalySeed {
  fieldId: number;
  month: string;
  expected: number;
  pct: number;
  severity: Severity;
  status: AnomalyStatus;
  note: string;
}

const ANOMALIES: AnomalySeed[] = [
  {
    fieldId: 5774394,
    month: '2026-08-01',
    expected: 36.5,
    pct: -22,
    severity: 'high',
    status: 'new',
    note: 'Output fell well below the expected range. The operator has not announced planned maintenance.',
  },
  {
    fieldId: 2053062,
    month: '2026-07-01',
    expected: 141,
    pct: -38,
    severity: 'high',
    status: 'explained',
    note: 'Planned turnaround at the Hammerfest LNG plant, per operator notice. Back to normal the month after.',
  },
  {
    fieldId: 21675433,
    month: '2026-08-01',
    expected: 27.7,
    pct: -12,
    severity: 'medium',
    status: 'investigating',
    note: 'Second monthly decline in a row and faster than the decline curve. Could be water breakthrough or a well issue.',
  },
  {
    fieldId: 32017325,
    month: '2026-06-01',
    expected: 188,
    pct: 14,
    severity: 'medium',
    status: 'resolved',
    note: 'Ramp-up faster than the model assumed. Model updated with the new plateau.',
  },
  {
    fieldId: 46437,
    month: '2026-08-01',
    expected: 733,
    pct: 9,
    severity: 'low',
    status: 'resolved',
    note: 'Higher gas offtake ahead of winter. Seasonal pattern now part of the forecast.',
  },
  {
    fieldId: 2845712,
    month: '2026-07-01',
    expected: 40.6,
    pct: -7,
    severity: 'low',
    status: 'explained',
    note: 'Short planned shutdown on the FPSO for inspection work.',
  },
];

function anomalies(): Anomaly[] {
  return ANOMALIES.flatMap((a, k) => {
    const seed = SEED_FIELDS.find((f) => f.id === a.fieldId);
    if (!seed) return [];
    const rand = seededRandom(`anomaly-${a.fieldId}`);
    const months = monthRange(addMonths(a.month, -17), a.month);
    const series = months.map((month, i) => {
      const expected = a.expected * (1 + (17 - i) * 0.004) * (1 + Math.sin(i * 0.9 + k) * 0.02);
      const isLast = i === months.length - 1;
      const actual = isLast
        ? a.expected * (1 + a.pct / 100)
        : expected * (1 + (rand() - 0.5) * 0.05);
      return { month, actual, expected, lo: expected * 0.92, hi: expected * 1.08 };
    });
    const actual = a.expected * (1 + a.pct / 100);
    return [
      {
        id: `${a.fieldId}-${a.month}`,
        fieldId: a.fieldId,
        fieldName: titleCaseName(seed.name),
        operatorName: SEED_GROUPS[seed.operatorId] ?? seed.operatorId,
        month: a.month,
        pctVsExpected: a.pct,
        severity: a.severity,
        status: a.status,
        note: a.note,
        expected: a.expected,
        actual,
        series,
        hits: seed.owners
          .filter(([groupId]) => FOCUS_IDS.includes(groupId))
          .map(([groupId, share]) => ({
            companyId: groupId,
            companyName: SEED_GROUPS[groupId] ?? groupId,
            kboed: ((actual - a.expected) * share) / 100,
          })),
      },
    ];
  });
}

/** Trading days (Mon–Fri) ending on `end`, newest last. */
function tradingDays(end: string, count: number): string[] {
  const days: string[] = [];
  for (let d = end; days.length < count; d = addDays(d, -1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days.reverse();
}

function priceSeries(
  id: PriceSeries['id'],
  name: string,
  unit: string,
  last: number,
  vol: number,
): PriceSeries {
  const days = tradingDays('2026-11-06', 64);
  const rand = seededRandom(`price-${id}`);
  const values = new Array<number>(days.length);
  values[days.length - 1] = last;
  for (let i = days.length - 2; i >= 0; i--) {
    values[i] = (values[i + 1] ?? last) / (1 + (rand() - 0.5) * vol);
  }
  return {
    id,
    name,
    unit,
    points: days.map((date, i) => ({ date, value: Math.round((values[i] ?? last) * 100) / 100 })),
  };
}

export function createMockExtras(core: CoreApi): ExtrasApi {
  return {
    async fieldForecast(id) {
      const history = await core.fieldProduction(id);
      const last = history[history.length - 1];
      const events = FIELD_EVENTS[id] ?? [];
      const rand = seededRandom(`forecast-${id}`);
      const b = Math.round((0.4 + rand() * 0.5) * 100) / 100;
      const model = {
        method: 'Arps hyperbolic decline',
        b,
        initialDeclinePctPerYear: 0,
        fitWindow: { start: history[0]?.month ?? '', end: last?.month ?? '' },
        backtestErrorPct: Math.round((3 + rand() * 5) * 10) / 10,
        runAt: MODEL_RUN_AT,
        version: 'arps-0.3.1',
      };
      if (!last || last.oeSm3 <= 0) return { fieldId: id, points: [], model, events };

      // Decline rate from the field's own last year, kept in a sane band.
      const recent = history.slice(-3);
      const yearAgo = history.slice(-15, -12);
      const perDay = (rows: typeof history) =>
        rows.reduce((s, r) => s + r.oeSm3, 0) /
        Math.max(
          1,
          rows.reduce((s, r) => s + r.daysInMonth, 0),
        );
      const qi = perDay(recent);
      const ratio = yearAgo.length ? qi / Math.max(1, perDay(yearAgo)) : 0.9;
      const di = Math.min(0.35, Math.max(0.05, -Math.log(ratio)));
      model.initialDeclinePctPerYear = Math.round(di * 1000) / 10;

      const points: Forecast[] = [
        { month: last.month, p10: last.oeSm3, p50: last.oeSm3, p90: last.oeSm3 },
      ];
      for (let k = 1; k <= FORECAST_MONTHS; k++) {
        const month = addMonths(last.month, k);
        const years = k / 12;
        const p50 = arpsRate(qi, b, di, years) * daysInMonth(month);
        const width = 0.03 + 0.055 * years;
        points.push({ month, p50, p10: p50 * (1 - width), p90: p50 * (1 + width * 0.8) });
      }
      const result: FieldForecast = { fieldId: id, points, model, events };
      return result;
    },

    async nowcasts() {
      const freshness = await core.freshness();
      const monthsInData = quarterMonths(OPEN_QUARTER).filter(
        (m) => m <= freshness.latestMonth,
      ).length;
      return FOCUS_IDS.map((companyId): Nowcast => {
        const [value, lo, hi] = OPEN_NOWCASTS[companyId] ?? [0, 0, 0];
        return {
          companyId,
          quarterStart: OPEN_QUARTER,
          value,
          lo,
          hi,
          madeAt: MODEL_RUN_AT,
          modelVersion: 'nowcast-0.2.0',
          hash: sampleHash(`${companyId}-${OPEN_QUARTER}`),
          status: 'open',
          monthsInData,
          expectedReportOn: reportDate(companyId, OPEN_QUARTER),
          reportKind: REPORTING[companyId]?.kind ?? 'quarterly report',
        };
      });
    },

    predictionLog: async () => predictionLog(),

    anomalies: async () => anomalies(),

    prices: async () => [
      priceSeries('brent', 'Brent', 'USD/bbl', 68.4, 0.03),
      priceSeries('ttf', 'TTF gas', 'EUR/MWh', 31.2, 0.045),
    ],

    forwardPrices: async () => ({
      asOf: '2026-11-06',
      quarterStart: OPEN_QUARTER,
      brentUsdPerBbl: 67.9,
      ttfEurPerMwh: 32.4,
      eurUsd: 1.16,
    }),

    ask: async (question) => answerQuestion(question),
  };
}
