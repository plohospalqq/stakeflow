/**
 * Volume units. Everything is stored as Sm³ oil equivalent per month (Sodir native);
 * conversion to what the reader picked happens only here, so a number can never be
 * converted twice or with a rounded 30-day month.
 */
import { daysInMonth, daysInQuarter } from './dates';

/** Barrels of oil equivalent per standard cubic metre of oil equivalent. */
export const BOE_PER_SM3 = 6.2898;

export type Unit = 'boe' | 'sm3';

export const UNIT_LABELS: Record<Unit, { short: string; long: string; toggle: string }> = {
  boe: { short: 'kboe/d', long: 'thousand barrels of oil equivalent per day', toggle: 'boe/d' },
  sm3: {
    short: 'MSm³ o.e./mo',
    long: 'million standard cubic metres of oil equivalent per month',
    toggle: 'Sm³ o.e.',
  },
};

export function isUnit(value: unknown): value is Unit {
  return value === 'boe' || value === 'sm3';
}

/** kboe/d = Sm³ o.e. × 6.2898 ÷ days ÷ 1000, using the real number of days. */
export function sm3ToKboed(sm3: number, days: number): number {
  return (sm3 * BOE_PER_SM3) / days / 1000;
}

/** Inverse of sm3ToKboed: total Sm³ o.e. produced over `days` at a kboe/d rate. */
export function kboedToSm3(kboed: number, days: number): number {
  return (kboed * 1000 * days) / BOE_PER_SM3;
}

/** MSm³ o.e. = Sm³ o.e. ÷ 1e6 */
export function sm3ToMsm3(sm3: number): number {
  return sm3 / 1e6;
}

/** One month's volume (Sm³ o.e.) in the display unit. */
export function monthToDisplay(sm3: number, month: string, unit: Unit): number {
  return unit === 'boe' ? sm3ToKboed(sm3, daysInMonth(month)) : sm3ToMsm3(sm3);
}

/**
 * A quarterly average given as kboe/d (how companies report it) in the display unit.
 * In Sm³ mode it becomes the average month of that quarter, so it sits on the same scale
 * as the monthly charts.
 */
export function quarterRateToDisplay(kboed: number, quarterStart: string, unit: Unit): number {
  if (unit === 'boe') return kboed;
  return sm3ToMsm3(kboedToSm3(kboed, daysInQuarter(quarterStart)) / 3);
}

/** A kboe/d rate over an arbitrary number of days, for values that are not month-bound. */
export function rateToDisplay(kboed: number, unit: Unit, days = 30.4375): number {
  return unit === 'boe' ? kboed : sm3ToMsm3(kboedToSm3(kboed, days));
}
