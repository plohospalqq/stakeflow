/**
 * Net-to-company production by field, shaped for a stacked chart: the largest fields by
 * name and the long tail folded into one "Other" layer, so six grey shades stay readable.
 */
import type { CompanyFieldMonthly } from '@/api/types';

export interface StackLayer {
  key: string;
  name: string;
  /** Set for a single field (links to its page); null for the "Other" layer. */
  fieldId: number | null;
  /** One value per month, display unit. */
  values: number[];
  /** Value in the newest month. */
  latest: number;
  /** Fraction of the newest month's total. */
  share: number;
}

export interface FieldStack {
  months: string[];
  /** Largest first; the stacked chart draws them bottom-up in this order. */
  layers: StackLayer[];
  totals: number[];
}

export function stackFields(
  rows: CompanyFieldMonthly[],
  months: string[],
  toDisplay: (sm3: number, month: string) => number,
  maxLayers = 6,
): FieldStack {
  const index = new Map(months.map((m, i) => [m, i]));
  const byField = new Map<number, { name: string; values: number[] }>();
  for (const r of rows) {
    const i = index.get(r.month);
    if (i === undefined) continue;
    const entry = byField.get(r.fieldId) ?? {
      name: r.fieldName,
      values: new Array<number>(months.length).fill(0),
    };
    entry.values[i] = (entry.values[i] ?? 0) + toDisplay(r.oeSm3, r.month);
    byField.set(r.fieldId, entry);
  }

  const last = months.length - 1;
  const ranked = [...byField.entries()]
    .map(([fieldId, e]) => ({ fieldId, ...e, latest: e.values[last] ?? 0 }))
    // Newest month first; fields that stopped producing rank by their recent past.
    .sort(
      (a, b) =>
        b.latest - a.latest ||
        b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0),
    );

  const named = ranked.length <= maxLayers ? ranked : ranked.slice(0, maxLayers - 1);
  const rest = ranked.slice(named.length);
  const totals = months.map((_, i) => ranked.reduce((s, f) => s + (f.values[i] ?? 0), 0));
  const latestTotal = totals[last] ?? 0;
  const share = (v: number) => (latestTotal > 0 ? v / latestTotal : 0);

  const layers: StackLayer[] = named.map((f) => ({
    key: String(f.fieldId),
    name: f.name,
    fieldId: f.fieldId,
    values: f.values,
    latest: f.latest,
    share: share(f.latest),
  }));
  if (rest.length > 0) {
    const values = months.map((_, i) => rest.reduce((s, f) => s + (f.values[i] ?? 0), 0));
    const latest = values[last] ?? 0;
    layers.push({
      key: 'other',
      name: `Other (${rest.length} fields)`,
      fieldId: null,
      values,
      latest,
      share: share(latest),
    });
  }
  return { months, layers, totals };
}
