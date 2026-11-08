import type { LatestSummary } from '@/api/types';
import { addMonths, daysInMonth } from './dates';
import { kboedToSm3, monthToDisplay, type Unit } from './units';

export interface LatestView {
  month: string;
  /** In the display unit. */
  value: number;
  /** Percent change vs previous month and same month last year, in the display unit. */
  momPct: number | null;
  yoyPct: number | null;
}

/**
 * Latest month and its changes in the display unit. In Sm³ mode a 28-day February is
 * a smaller volume than a 31-day January at the same rate, so the deltas are computed on
 * the unit the reader sees, not copied from the boe/d rates.
 */
export function latestView(latest: LatestSummary, unit: Unit): LatestView {
  const value = monthToDisplay(latest.oeSm3, latest.month, unit);
  const compare = (boePerDay: number | null, month: string) => {
    if (boePerDay === null || boePerDay <= 0) return null;
    const other = monthToDisplay(kboedToSm3(boePerDay / 1000, daysInMonth(month)), month, unit);
    return (value / other - 1) * 100;
  };
  return {
    month: latest.month,
    value,
    momPct: compare(latest.prevMonthBoePerDay, addMonths(latest.month, -1)),
    yoyPct: compare(latest.yearAgoBoePerDay, addMonths(latest.month, -12)),
  };
}
