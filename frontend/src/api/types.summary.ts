/** Shelf-wide summary for the landing page (GET /summary). Real data, from Sodir. */
import type { Month } from './types';

export interface SummaryField {
  id: number;
  /** Title-cased for display. */
  name: string;
  boePerDay: number;
  yearAgoBoePerDay: number | null;
  oilShare: number;
}

export interface ShelfSummary {
  month: Month;
  boePerDay: number;
  prevMonthBoePerDay: number | null;
  yearAgoBoePerDay: number | null;
  mix: { oil: number; gas: number; nglCond: number };
  producingFields: number;
  /** The state's direct stake (SDFI, managed by Petoro). */
  stateBoePerDay: number;
  stateShare: number;
  /** Last full calendar year of gas, in billion Sm³ of gas. */
  gasYear: number;
  gasYearBnSm3: number;
  topFields: SummaryField[];
  /** Whole shelf, last 24 months, oldest first. */
  series: { month: Month; boePerDay: number }[];
}
