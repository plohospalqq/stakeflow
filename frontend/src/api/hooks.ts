/**
 * TanStack Query hooks: the only way components read data. Query keys live here so cache
 * sharing is deliberate (the overview and company page reuse the same company queries).
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { addMonths } from '@/lib/dates';
import { core, extras } from './index';
import { isNotFound } from './http';
import type { FieldStatus, MonthRange } from './types';

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
  forwardPrices: ['prices', 'forward'] as const,
  ask: (question: string) => ['ask', question] as const,
};

/** A 404 will not fix itself; anything else gets the default single retry. */
const retryUnlessNotFound = (failureCount: number, error: Error) =>
  !isNotFound(error) && failureCount < 1;

export function useFreshness() {
  return useQuery({ queryKey: queryKeys.freshness, queryFn: () => core.freshness() });
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
  return useQuery({ queryKey: queryKeys.nowcasts, queryFn: () => extras.nowcasts() });
}

export function usePredictionLog() {
  return useQuery({ queryKey: queryKeys.predictionLog, queryFn: () => extras.predictionLog() });
}

export function useAnomalies() {
  return useQuery({ queryKey: queryKeys.anomalies, queryFn: () => extras.anomalies() });
}

export function usePrices() {
  return useQuery({ queryKey: queryKeys.prices, queryFn: () => extras.prices() });
}

export function useForwardPrices() {
  return useQuery({ queryKey: queryKeys.forwardPrices, queryFn: () => extras.forwardPrices() });
}

export function useAsk(question: string | null) {
  return useQuery({
    queryKey: queryKeys.ask(question ?? ''),
    queryFn: () => extras.ask(question ?? ''),
    enabled: Boolean(question),
    staleTime: Infinity,
  });
}
