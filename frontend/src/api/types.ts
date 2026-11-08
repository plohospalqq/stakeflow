/**
 * Domain models the UI works with. API responses (schema.gen.ts) are mapped into these
 * in http.ts; the mock layer produces them directly. Volumes are Sm³ oil equivalent per
 * month (Sodir native) unless a name says otherwise; conversion happens in lib/units.ts.
 */
import type { Mix } from '@/lib/mix';

/** First day of a month as an ISO date, e.g. '2026-08-01'. */
export type Month = string;

export type FieldStatus = 'Producing' | 'Shut down' | 'Approved for production';

export interface MonthRange {
  start?: Month;
  end?: Month;
}

export interface LatestSummary {
  month: Month;
  oeSm3: number;
  boePerDay: number;
  prevMonthBoePerDay: number | null;
  yearAgoBoePerDay: number | null;
  /** Product split of oeSm3; nglCond is NGL + condensate. */
  mix: Mix;
}

export interface Company {
  /** Group slug, e.g. 'aker-bp'. */
  id: string;
  /** Display name from the API; Equinor arrives as 'Equinor (NCS only)'. */
  name: string;
  isFocus: boolean;
  scopeNote: string | null;
  producingFieldCount: number;
  latest: LatestSummary | null;
}

export interface LegalEntity {
  companyId: number;
  name: string;
  nationCode: string | null;
  factpageUrl: string | null;
}

export interface CompanyDetail extends Company {
  legalEntities: LegalEntity[];
}

/**
 * One month of production. All volumes are Sm³ o.e. except gasSm3, so
 * oilSm3 + gasOeSm3 + nglCondSm3 = oeSm3 exactly.
 */
export interface MonthlyVolumes {
  month: Month;
  daysInMonth: number;
  oilSm3: number;
  /** Gas as oil equivalent: physical gas ÷ 1000. */
  gasOeSm3: number;
  /** NGL + condensate. Sodir reports them separately; the UI shows them as one product. */
  nglCondSm3: number;
  oeSm3: number;
  /** Physical gas volume in Sm³ (used for the revenue estimate). */
  gasSm3: number;
}

export type FieldMonthly = MonthlyVolumes;
export type CompanyMonthly = MonthlyVolumes;

export interface OperatorRef {
  id: string;
  name: string;
}

export interface FieldSummary {
  id: number;
  /** Title-cased for display ('Johan Sverdrup'). */
  name: string;
  status: string;
  hcType: string | null;
  mainArea: string | null;
  operator: OperatorRef | null;
  lon: number | null;
  lat: number | null;
  latest: LatestSummary | null;
}

export interface Owner {
  companyId: number;
  companyName: string;
  groupId: string;
  groupName: string;
  sharePct: number;
}

export interface FieldDetail extends FieldSummary {
  discoveryYear: number | null;
  areaKm2: number | null;
  firstProductionMonth: Month | null;
  lastProductionMonth: Month | null;
  factpageUrl: string | null;
  currentOwners: Owner[];
}

/** A period during which a company held a share of a field. validTo is exclusive. */
export interface LicenceShare {
  fieldId: number;
  companyId: number;
  companyName: string;
  groupId: string;
  groupName: string;
  sharePct: number;
  validFrom: string;
  validTo: string | null;
}

/** Net-to-company production of one field in one month. */
export interface CompanyFieldMonthly {
  fieldId: number;
  fieldName: string;
  month: Month;
  /** Day-weighted share of the field that month. */
  sharePct: number;
  oeSm3: number;
}

/** Sodir-attributed production next to what the company reported for the quarter. */
export interface ReportedQuarter {
  quarterStart: Month;
  monthsInData: number;
  isComplete: boolean;
  attributedKboed: number;
  reportedKboed: number | null;
  /** (attributed − reported) / reported, in percent. */
  errorPct: number | null;
  reportedOn: string | null;
  sourceUrl: string | null;
}

export interface PublicationLag {
  month: Month;
  lagDaysMin: number | null;
  lagDaysMax: number;
  isMeasured: boolean;
}

export interface Freshness {
  latestMonth: Month;
  lastRefreshAt: string | null;
  source: string;
  licence: string;
  recentPublicationLags: PublicationLag[];
}

export type OutlineGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

// A type alias (not an interface) so it is assignable to GeoJSON's open properties type.
export type OutlineProps = {
  id: number;
  name: string;
  status: string;
  operatorId: string | null;
  boePerDay: number | null;
  oilShare: number | null;
};

export interface OutlineFeature {
  type: 'Feature';
  geometry: OutlineGeometry;
  properties: OutlineProps;
}

export interface FieldOutlines {
  type: 'FeatureCollection';
  features: OutlineFeature[];
}

// ---------------------------------------------------------------------------------------
// Not served by the backend yet: always sample data from the mock layer.
// ---------------------------------------------------------------------------------------

/** Forecast for one month, Sm³ o.e. The first point repeats the last actual month. */
export interface Forecast {
  month: Month;
  p10: number;
  p50: number;
  p90: number;
}

export interface ModelCard {
  method: string;
  /** Arps b-factor (0 = exponential, 1 = harmonic). */
  b: number;
  /** Initial decline, % per year. */
  initialDeclinePctPerYear: number;
  fitWindow: { start: Month; end: Month };
  /** Mean absolute % error of 12-month-ahead backtests. */
  backtestErrorPct: number;
  runAt: string;
  version: string;
}

export interface FieldForecast {
  fieldId: number;
  points: Forecast[];
  model: ModelCard;
  events: { month: Month; label: string }[];
}

export type NowcastStatus = 'open' | 'resolved';

/** Quarterly production forecast, frozen at quarter end, scored against the trading update. */
export interface Nowcast {
  companyId: string;
  quarterStart: Month;
  /** Prediction and 80% range, kboe/d. */
  value: number;
  lo: number;
  hi: number;
  madeAt: string;
  modelVersion: string;
  hash: string;
  status: NowcastStatus;
  /** Months of the quarter already in Sodir field data. */
  monthsInData: number;
  /** When the company is expected to publish (trading update or quarterly report). */
  expectedReportOn: string;
  reportKind: 'trading update' | 'quarterly report';
}

/** One row of the public prediction log. Revisions are new rows, never edits. */
export interface Prediction {
  id: string;
  companyId: string;
  companyName: string;
  quarterStart: Month;
  madeAt: string;
  reportedOn: string | null;
  expectedReportOn: string;
  predicted: number;
  lo: number;
  hi: number;
  actual: number | null;
  /** Simple baseline: last quarter's reported value. */
  baseline: number;
  status: NowcastStatus;
  hash: string;
  /** Link to the commit that published the prediction; null for sample rows. */
  commitUrl: string | null;
  modelVersion: string;
}

export type Severity = 'high' | 'medium' | 'low';
export type AnomalyStatus = 'new' | 'investigating' | 'explained' | 'resolved';

export interface Anomaly {
  id: string;
  fieldId: number;
  fieldName: string;
  operatorName: string;
  month: Month;
  /** Actual vs expected, percent. */
  pctVsExpected: number;
  severity: Severity;
  status: AnomalyStatus;
  note: string;
  /** kboe/d */
  expected: number;
  actual: number;
  /** 18 months of actual vs the expected band, kboe/d. */
  series: { month: Month; actual: number; expected: number; lo: number; hi: number }[];
  /** Effect on each owner's production, kboe/d (negative = lost). */
  hits: { companyId: string; companyName: string; kboed: number }[];
}

export interface Price {
  date: string;
  value: number;
}

export interface PriceSeries {
  id: 'brent' | 'ttf';
  name: string;
  unit: string;
  points: Price[];
}

export interface ForwardPrices {
  asOf: string;
  quarterStart: Month;
  brentUsdPerBbl: number;
  ttfEurPerMwh: number;
  eurUsd: number;
}

export interface AskStep {
  label: string;
  detail: string;
}

export interface AskAnswer {
  question: string;
  steps: AskStep[];
  answer: string;
  sql: string;
  durationMs: number;
  columns: string[];
  rows: (string | number)[][];
  /** Bars: one per row, with an optional comparison value drawn thinner underneath. */
  chart: { label: string; value: number; previous: number | null }[];
  chartUnit: string;
  chartLegend: { current: string; previous: string | null };
  followUps: string[];
  /** False when the question did not match anything the preview can answer. */
  matched: boolean;
}

export interface AskTable {
  name: string;
  description: string;
}
