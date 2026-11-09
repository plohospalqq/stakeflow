/**
 * TanStack Query hooks: the only way components read data. Query keys live here so cache
 * sharing is deliberate (the overview and company page reuse the same company queries).
 */
import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { addMonths } from '@/lib/dates';
import { core, extras } from './index';
import { isNotFound, isUnavailable } from './http';
import { IS_STATIC_DEMO } from './mode';
import { staticSnapshotInfo } from './static';
import type { FieldStatus, MonthRange } from './types';
import type { ParseContext, ScenarioParams, ScenarioResult } from './types.scenario';

export const queryKeys = {
  freshness: ['freshness'] as const,
  companies: (focus: boolean) => ['companies', { focus }] as const,
  company: (id: string) => ['company', id] as const,
  companyProduction: (id: string, range?: MonthRange) =>
    ['company', id, 'production', range ?? {}] as const,
  companyFields: (id: string, range?: MonthRange) =>
    ['company', id, 'fields', range ?? {}] as const,
  companyQuarters: (id: string) => ['company', id, 'quarters'] as const,
  fields: (status?: FieldStatus) => ['fields', { status }] as const,
  fieldsOwnedBy: (owner: string) => ['fields', { owner }] as const,
  field: (id: number) => ['field', id] as const,
  fieldProduction: (id: number, range?: MonthRange) =>
    ['field', id, 'production', range ?? {}] as const,
  fieldOwnership: (id: number) => ['field', id, 'ownership'] as const,
  fieldOutlines: ['fields', 'outlines'] as const,
  fieldForecast: (id: number) => ['field', id, 'forecast'] as const,
  nowcasts: ['nowcasts'] as const,
  predictionLog: ['predictions'] as const,
  anomalies: ['anomalies'] as const,
  prices: ['prices'] as const,
  latestPrices: ['prices', 'latest'] as const,
  ask: (question: string) => ['ask', question] as const,
  askTables: ['ask', 'tables'] as const,
  snapshotInfo: ['snapshot'] as const,
  summary: ['summary'] as const,
  sharePrices: (companyId: string) => ['share-prices', companyId] as const,
  scenarioPresets: ['scenario', 'presets'] as const,
  scenario: (companyId: string, params: ScenarioParams) => ['scenario', companyId, params] as const,
};

/**
 * A 404 will not fix itself, nor will a 503 (no model run, no AI key) within a second;
 * anything else gets the default single retry.
 */
const retryUnlessNotFound = (failureCount: number, error: Error) =>
  !isNotFound(error) && !isUnavailable(error) && failureCount < 1;

export function useFreshness() {
  return useQuery({ queryKey: queryKeys.freshness, queryFn: () => core.freshness() });
}

/** When the static demo's data was exported; disabled outside the static demo. */
export function useSnapshotInfo() {
  return useQuery({
    queryKey: queryKeys.snapshotInfo,
    queryFn: staticSnapshotInfo,
    enabled: IS_STATIC_DEMO,
    staleTime: Infinity,
  });
}

export function useCompanies(focus = false) {
  return useQuery({
    queryKey: queryKeys.companies(focus),
    queryFn: () => core.companies({ focus, limit: focus ? undefined : 200 }),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: queryKeys.company(id),
    queryFn: () => core.company(id),
    retry: retryUnlessNotFound,
  });
}

export function useCompanyProduction(id: string, range?: MonthRange) {
  return useQuery({
    queryKey: queryKeys.companyProduction(id, range),
    queryFn: () => core.companyProduction(id, range),
    retry: retryUnlessNotFound,
  });
}

export function useCompanyFields(id: string, range?: MonthRange) {
  return useQuery({
    queryKey: queryKeys.companyFields(id, range),
    queryFn: () => core.companyFields(id, range),
    retry: retryUnlessNotFound,
  });
}

export function useCompanyQuarters(id: string) {
  return useQuery({
    queryKey: queryKeys.companyQuarters(id),
    queryFn: () => core.companyQuarters(id),
    retry: retryUnlessNotFound,
  });
}

/** Reconciliation for several companies at once (track record), sharing the per-company cache. */
export function useCompaniesQuarters(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.companyQuarters(id),
      queryFn: () => core.companyQuarters(id),
      retry: retryUnlessNotFound,
    })),
  });
}

export function useFields(status?: FieldStatus) {
  return useQuery({ queryKey: queryKeys.fields(status), queryFn: () => core.fields({ status }) });
}

/** Fields a company holds a share in today (for the map's owner highlight). */
export function useFieldsOwnedBy(owner: string | null) {
  return useQuery({
    queryKey: queryKeys.fieldsOwnedBy(owner ?? ''),
    queryFn: () => core.fields({ owner: owner ?? undefined }),
    enabled: Boolean(owner),
  });
}

export function useField(id: number) {
  return useQuery({
    queryKey: queryKeys.field(id),
    queryFn: () => core.field(id),
    enabled: Number.isFinite(id),
    retry: retryUnlessNotFound,
  });
}

export function useFieldProduction(id: number, range?: MonthRange, enabled = true) {
  return useQuery({
    queryKey: queryKeys.fieldProduction(id, range),
    queryFn: () => core.fieldProduction(id, range),
    enabled: enabled && Number.isFinite(id),
    retry: retryUnlessNotFound,
  });
}

/** Whole history since first production (capped at 25 years to keep the payload sane). */
export function useFieldHistory(
  id: number,
  firstMonth: string | null | undefined,
  latest?: string,
) {
  const start =
    firstMonth && latest
      ? firstMonth > addMonths(latest, -300)
        ? firstMonth
        : addMonths(latest, -300)
      : undefined;
  return useFieldProduction(id, start ? { start } : undefined, Boolean(start));
}

export function useFieldOwnership(id: number) {
  return useQuery({
    queryKey: queryKeys.fieldOwnership(id),
    queryFn: () => core.fieldOwnership(id),
    enabled: Number.isFinite(id),
    retry: retryUnlessNotFound,
  });
}

export function useFieldOutlines() {
  return useQuery({
    queryKey: queryKeys.fieldOutlines,
    queryFn: () => core.fieldOutlines(),
    staleTime: Infinity,
  });
}

export function useFieldForecast(id: number) {
  return useQuery({
    queryKey: queryKeys.fieldForecast(id),
    queryFn: () => extras.fieldForecast(id),
    enabled: Number.isFinite(id),
    retry: retryUnlessNotFound,
  });
}

export function useNowcasts() {
  return useQuery({
    queryKey: queryKeys.nowcasts,
    queryFn: () => extras.nowcasts(),
    retry: retryUnlessNotFound,
  });
}

export function usePredictionLog() {
  return useQuery({
    queryKey: queryKeys.predictionLog,
    queryFn: () => extras.predictionLog(),
    retry: retryUnlessNotFound,
  });
}

export function useAnomalies() {
  return useQuery({
    queryKey: queryKeys.anomalies,
    queryFn: () => extras.anomalies(),
    retry: retryUnlessNotFound,
  });
}

export function usePrices() {
  return useQuery({
    queryKey: queryKeys.prices,
    queryFn: () => extras.prices(),
    retry: retryUnlessNotFound,
  });
}

/** Newest Brent, TTF and EUR/USD: the revenue estimate's default prices. */
export function useLatestPrices() {
  return useQuery({
    queryKey: queryKeys.latestPrices,
    queryFn: () => extras.latestPrices(),
    retry: retryUnlessNotFound,
  });
}

export function useAsk(question: string | null) {
  return useQuery({
    queryKey: queryKeys.ask(question ?? ''),
    queryFn: () => extras.ask(question ?? ''),
    enabled: Boolean(question),
    staleTime: Infinity,
  });
}

export function useAskTables() {
  return useQuery({
    queryKey: queryKeys.askTables,
    queryFn: () => extras.askTables(),
    staleTime: Infinity,
  });
}

export function useSummary() {
  return useQuery({ queryKey: queryKeys.summary, queryFn: () => core.summary() });
}

export function useSharePrices(companyId: string) {
  return useQuery({
    queryKey: queryKeys.sharePrices(companyId),
    queryFn: () => extras.sharePrices(companyId),
    retry: retryUnlessNotFound,
  });
}

export function useScenarioPresets() {
  return useQuery({
    queryKey: queryKeys.scenarioPresets,
    queryFn: () => extras.scenarioPresets(),
    staleTime: Infinity,
    retry: retryUnlessNotFound,
  });
}

/**
 * Keeps the previous answer on screen while sliders move, so the result never blinks; but
 * never another company's answer, which would show the wrong model under the new name.
 */
export function useScenario(companyId: string, params: ScenarioParams) {
  return useQuery({
    queryKey: queryKeys.scenario(companyId, params),
    queryFn: () => extras.runScenario(companyId, params),
    placeholderData: (previous: ScenarioResult | undefined) =>
      previous?.companyId === companyId ? keepPreviousData(previous) : undefined,
    retry: retryUnlessNotFound,
  });
}

/** Free text → scenario parameters. A mutation: it runs on request, not on render. */
export function useParseScenario() {
  return useMutation({
    mutationFn: ({ text, context }: { text: string; context: ParseContext }) =>
      extras.parseScenario(text, context),
  });
}
