import { addDays, addMonths, monthEnd } from './dates';

/** Sodir field-level data lands 40–69 days after month end (docs/nowcast-feasibility.md). */
export const LAG_MIN_DAYS = 40;
export const LAG_MAX_DAYS = 69;

export interface ReleaseWindow {
  month: string;
  from: string;
  to: string;
}

/** When the month after `latestMonth` should appear in Sodir's field data. */
export function nextReleaseWindow(latestMonth: string): ReleaseWindow {
  const next = addMonths(latestMonth, 1);
  const end = monthEnd(next);
  return { month: next, from: addDays(end, LAG_MIN_DAYS), to: addDays(end, LAG_MAX_DAYS) };
}
