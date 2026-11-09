/**
 * Display facts about the focus companies that the API does not carry: ticker and how each
 * first publishes quarterly production (docs/nowcast-feasibility.md). Words (scope lines,
 * the localised "Equinor (NCS only)") live in the dictionaries; see useCompanyName.
 */
export const FOCUS_ORDER = ['aker-bp', 'var-energi', 'equinor'];

/** The landing page's race order: largest first, so the bars read as a ranking. */
export const RACE_ORDER = ['equinor', 'var-energi', 'aker-bp'];

export interface CompanyMeta {
  /** English display name, as the API sends it; the UI localises Equinor's scope label. */
  name: string;
  ticker: string;
  /** How production is first published each quarter. */
  reportKind: 'trading update' | 'quarterly report';
}

export const COMPANY_META: Record<string, CompanyMeta> = {
  'aker-bp': { name: 'Aker BP', ticker: 'AKRBP', reportKind: 'trading update' },
  'var-energi': { name: 'Vår Energi', ticker: 'VAR', reportKind: 'trading update' },
  equinor: { name: 'Equinor (NCS only)', ticker: 'EQNR', reportKind: 'quarterly report' },
};

export function sortFocus<T extends { id: string }>(companies: T[]): T[] {
  const rank = (id: string) => {
    const i = FOCUS_ORDER.indexOf(id);
    return i === -1 ? FOCUS_ORDER.length : i;
  };
  return [...companies].sort((a, b) => rank(a.id) - rank(b.id));
}
