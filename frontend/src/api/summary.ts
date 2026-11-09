/**
 * Live client for GET /summary. Kept beside http.ts rather than in it while the data-mode
 * work changes that file; it uses the same relative /api prefix and error type, so moving
 * it into httpCore later is a cut-and-paste.
 */
import { titleCaseName } from '@/lib/format';
import { ApiError } from './http';
import type { components } from './schema.gen';
import type { ShelfSummary } from './types.summary';

type Wire = components['schemas']['ShelfSummary'];

export function mapSummary(s: Wire): ShelfSummary {
  return {
    month: s.month,
    boePerDay: s.boePerDay,
    prevMonthBoePerDay: s.prevMonthBoePerDay,
    yearAgoBoePerDay: s.yearAgoBoePerDay,
    mix: { oil: s.oilShare, gas: s.gasShare, nglCond: s.nglCondensateShare },
    producingFields: s.producingFields,
    stateBoePerDay: s.stateBoePerDay,
    stateShare: s.stateShare,
    gasYear: s.gasYear,
    gasYearBnSm3: s.gasYearBnSm3,
    topFields: s.topFields.map((f) => ({ ...f, name: titleCaseName(f.name) })),
    series: s.series.map((p) => ({ month: p.month, boePerDay: p.boePerDay })),
  };
}

export async function fetchSummary(): Promise<ShelfSummary> {
  const path = '/summary';
  const res = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, path);
  // The response shape is guaranteed by the OpenAPI contract the types are generated from.
  return mapSummary((await res.json()) as Wire); // eslint-disable-line @typescript-eslint/consistent-type-assertions -- JSON boundary: fetch returns untyped data
}
