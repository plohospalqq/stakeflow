/**
 * The two halves of the data layer. CoreApi is what the backend serves today (live API,
 * or mocks when VITE_USE_MOCKS=true). ExtrasApi is what it does not serve yet; it is
 * always the mock layer, and every UI element showing it carries a "Sample data" badge.
 */
import type {
  AskAnswer,
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
  ForwardPrices,
  Freshness,
  LicenceShare,
  MonthRange,
  Nowcast,
  Prediction,
  PriceSeries,
  ReportedQuarter,
} from './types';

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
  fieldForecast(id: number): Promise<FieldForecast>;
  nowcasts(): Promise<Nowcast[]>;
  predictionLog(): Promise<Prediction[]>;
  anomalies(): Promise<Anomaly[]>;
  prices(): Promise<PriceSeries[]>;
  forwardPrices(): Promise<ForwardPrices>;
  ask(question: string): Promise<AskAnswer>;
}
