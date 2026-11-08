/**
 * Display facts about the focus companies that the API does not carry: ticker, a short
 * scope line, and when each publishes quarterly production (docs/nowcast-feasibility.md).
 */
export const FOCUS_ORDER = ['aker-bp', 'var-energi', 'equinor'];

export interface CompanyMeta {
  ticker: string;
  /** One line under the name; Equinor's says it is not comparable to group totals. */
  scope: string;
  /** How production is first published each quarter. */
  reportKind: 'trading update' | 'quarterly report';
}

export const COMPANY_META: Record<string, CompanyMeta> = {
  'aker-bp': {
    ticker: 'AKRBP',
    scope: 'Norwegian shelf · all of its production',
    reportKind: 'trading update',
  },
  'var-energi': {
    ticker: 'VAR',
    scope: 'Norwegian shelf · all of its production',
    reportKind: 'trading update',
  },
  equinor: {
    ticker: 'EQNR',
    scope: 'Norwegian shelf only · not comparable with group totals',
    reportKind: 'quarterly report',
  },
};

export function sortFocus<T extends { id: string }>(companies: T[]): T[] {
  const rank = (id: string) => {
    const i = FOCUS_ORDER.indexOf(id);
    return i === -1 ? FOCUS_ORDER.length : i;
  };
  return [...companies].sort((a, b) => rank(a.id) - rank(b.id));
}
