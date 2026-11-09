/**
 * "What it means" numbers for the plain-language layer, computed from real data. Each one
 * is a yardstick shown with its assumption on screen, never a claim beyond the data.
 */
import type { ShelfSummary } from '@/api/types.summary';
import { GAS_KWH_PER_SM3 } from './revenue';

/** A typical home's yearly heat demand, kWh. A yardstick, footnoted on screen. */
export const KWH_PER_HOME_YEAR = 12_000;

/** Homes one year of gas could heat: bn Sm³ × 1e9 × 10.8 kWh ÷ 12,000 kWh per home. */
export function homesHeated(gasBnSm3: number): number {
  return (gasBnSm3 * 1e9 * GAS_KWH_PER_SM3) / KWH_PER_HOME_YEAR;
}

/** The largest field that is mostly oil, and how it changed in a year. */
export function largestOilField(summary: ShelfSummary) {
  const field = [...summary.topFields]
    .filter((f) => f.oilShare >= 0.5)
    .sort((a, b) => b.boePerDay - a.boePerDay)[0];
  if (!field || !field.yearAgoBoePerDay) return null;
  return { field, yoyPct: (field.boePerDay / field.yearAgoBoePerDay - 1) * 100 };
}
