import { useCallback } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { COMPANY_META } from '@/lib/companies';

/**
 * Company names for display. Proper names stay as they are; Equinor always carries its
 * scope label, translated but never shortened ("Equinor (kun norsk sokkel)").
 */
export function useCompanyName(): (id: string, fallback?: string) => string {
  const { m } = useI18n();
  return useCallback(
    (id, fallback) =>
      id === 'equinor' ? m.companyMeta.equinorName : (COMPANY_META[id]?.name ?? fallback ?? id),
    [m],
  );
}

/** The one-line scope under a company name. */
export function useCompanyScope(): (id: string) => string {
  const { m } = useI18n();
  return useCallback(
    (id) => (id === 'equinor' ? m.companyMeta.scopeEquinor : m.companyMeta.scopeAll),
    [m],
  );
}

/** 'trading update' / 'quarterly report' in the reader's language. */
export function useReportKind(): (
  kind: 'trading update' | 'quarterly report',
  cap?: boolean,
) => string {
  const { m } = useI18n();
  return useCallback(
    (kind, cap = false) =>
      kind === 'trading update'
        ? cap
          ? m.companyMeta.tradingUpdateCap
          : m.companyMeta.tradingUpdate
        : cap
          ? m.companyMeta.quarterlyReportCap
          : m.companyMeta.quarterlyReport,
    [m],
  );
}
