/** Derived numbers for the field page, computed from real monthly history. */

export interface Plateau {
  /** Average level over the plateau years, in the input unit. */
  value: number;
  fromYear: number;
  toYear: number;
}

/** Plateau years must stay within this fraction of the best year. */
const PLATEAU_BAND = 0.92;

/**
 * The plateau a field held: the best complete calendar year, extended to the
 * neighbouring years that stayed within 8% of it. Simple enough to explain in a tooltip.
 */
export function plateau(series: { month: string; value: number }[]): Plateau | null {
  const years = new Map<number, number[]>();
  for (const p of series) {
    const y = Number(p.month.slice(0, 4));
    years.set(y, [...(years.get(y) ?? []), p.value]);
  }
  const annual = [...years.entries()]
    .filter(([, values]) => values.length === 12)
    .map(([year, values]) => ({ year, avg: values.reduce((s, v) => s + v, 0) / 12 }))
    .sort((a, b) => a.year - b.year);
  if (annual.length === 0) return null;
  const peakIndex = annual.reduce(
    (best, a, i) => (a.avg > (annual[best]?.avg ?? -1) ? i : best),
    0,
  );
  const peak = annual[peakIndex]?.avg ?? 0;
  let from = peakIndex;
  let to = peakIndex;
  while (from > 0 && (annual[from - 1]?.avg ?? 0) >= peak * PLATEAU_BAND) from--;
  while (to < annual.length - 1 && (annual[to + 1]?.avg ?? 0) >= peak * PLATEAU_BAND) to++;
  const run = annual.slice(from, to + 1);
  return {
    value: run.reduce((s, a) => s + a.avg, 0) / run.length,
    fromYear: run[0]?.year ?? 0,
    toYear: run[run.length - 1]?.year ?? 0,
  };
}
