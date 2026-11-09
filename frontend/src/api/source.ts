/**
 * The two halves of the data layer. CoreApi is production, ownership and reported quarters.
 * ExtrasApi is the models, markets and Ask: the live API serves all of it, the static demo
 * its public parts, and the mock layer stands in for the rest (mode.ts says what is sample).
 */
import type {
  AskReply,
  AskTable,
  Anomaly,
  Company,
  CompanyDetail,
  CompanyFieldMonthly,
  CompanyMonthly,
  FieldDetail,
  FieldForecast,
  FieldMonthly,
  FieldOutlines,
  FieldStatus,
  FieldSummary,
  Freshness,
  LatestPrices,
  LicenceShare,
  MonthRange,
  Nowcast,
  Prediction,
  PriceSeries,
  ReportedQuarter,
} from './types';
import type {
  ParseContext,
  ParsedScenario,
  ScenarioParams,
  ScenarioPreset,
  ScenarioResult,
  SharePriceSeries,
} from './types.scenario';
import type { ShelfSummary } from './types.summary';

export interface CoreApi {
  freshness(): Promise<Freshness>;
  companies(params?: { focus?: boolean; limit?: number }): Promise<Company[]>;
  company(id: string): Promise<CompanyDetail>;
  companyProduction(id: string, range?: MonthRange): Promise<CompanyMonthly[]>;
  companyFields(id: string, range?: MonthRange): Promise<CompanyFieldMonthly[]>;
  companyQuarters(id: string, since?: string): Promise<ReportedQuarter[]>;
  fields(params?: { status?: FieldStatus; owner?: string }): Promise<FieldSummary[]>;
  field(id: number): Promise<FieldDetail>;
  fieldProduction(id: number, range?: MonthRange): Promise<FieldMonthly[]>;
  fieldOwnership(id: number): Promise<LicenceShare[]>;
  fieldOutlines(): Promise<FieldOutlines>;
}

export interface ExtrasApi {
  /** 404 when the field has no model card (nothing produced in the last two years). */
  fieldForecast(id: number): Promise<FieldForecast>;
  /** The newest live prediction per focus company, for the open quarter. */
  nowcasts(): Promise<Nowcast[]>;
  /** The newest row per company, quarter and kind: live and backtest rows both. */
  predictionLog(): Promise<Prediction[]>;
  anomalies(): Promise<Anomaly[]>;
  /** Brent (daily) and TTF (monthly) over the last year. */
  prices(): Promise<PriceSeries[]>;
  latestPrices(): Promise<LatestPrices>;
  ask(question: string): Promise<AskReply>;
  askTables(): Promise<AskTable[]>;
  sharePrices(companyId: string): Promise<SharePriceSeries>;
  scenarioPresets(): Promise<ScenarioPreset[]>;
  /** The answer carries the model with its fit, the caveats and the notice. */
  runScenario(companyId: string, params: ScenarioParams): Promise<ScenarioResult>;
  /** Free text → parameters (an LLM on the backend). 503 = AI not configured there. */
  parseScenario(text: string, context: ParseContext): Promise<ParsedScenario>;
}

/**
 * GET /summary. Separate from CoreApi only so http.ts (being reworked for the static data
 * mode) needs no change yet; fold summary() into CoreApi when that lands.
 */
export interface ShelfSummaryApi {
  summary(): Promise<ShelfSummary>;
}
