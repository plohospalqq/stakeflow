import { describe, expect, it } from 'vitest';
import {
  BOE_PER_SM3,
  kboedToSm3,
  monthToDisplay,
  quarterRateToDisplay,
  sm3ToKboed,
  sm3ToMsm3,
} from './units';

describe('sm3ToKboed', () => {
  it('uses the real number of days in the month', () => {
    // Johan Sverdrup, Aug 2026: 3,046,501 Sm³ o.e. over 31 days → 618.1 kboe/d (API value)
    expect(sm3ToKboed(3_046_501, 31)).toBeCloseTo(618.125, 3);
  });

  it('gives a higher rate for the same volume in a shorter month', () => {
    expect(sm3ToKboed(1_000_000, 28)).toBeGreaterThan(sm3ToKboed(1_000_000, 31));
    expect(sm3ToKboed(1_000_000, 30)).toBeCloseTo((1_000_000 * BOE_PER_SM3) / 30 / 1000, 9);
  });

  it('round-trips with kboedToSm3', () => {
    expect(kboedToSm3(sm3ToKboed(1_831_282, 31), 31)).toBeCloseTo(1_831_282, 6);
  });
});

describe('sm3ToMsm3', () => {
  it('divides by one million', () => {
    expect(sm3ToMsm3(7_211_126.68)).toBeCloseTo(7.211, 3);
  });
});

describe('monthToDisplay', () => {
  it('converts a monthly volume to kboe/d using the days of that month', () => {
    expect(monthToDisplay(1_000_000, '2026-02-01', 'boe')).toBeCloseTo(sm3ToKboed(1_000_000, 28));
    expect(monthToDisplay(1_000_000, '2024-02-01', 'boe')).toBeCloseTo(sm3ToKboed(1_000_000, 29));
  });

  it('converts to MSm³ o.e. per month without touching the day count', () => {
    expect(monthToDisplay(1_500_000, '2026-02-01', 'sm3')).toBe(1.5);
  });
});

describe('quarterRateToDisplay', () => {
  it('keeps kboe/d as is', () => {
    expect(quarterRateToDisplay(383.6, '2026-04-01', 'boe')).toBe(383.6);
  });

  it('turns a quarterly rate into the average month of the quarter', () => {
    // Q2 has 91 days: 100 kboe/d → 100,000 × 91 / 6.2898 Sm³ → ÷3 months → MSm³
    const expected = (100_000 * 91) / BOE_PER_SM3 / 3 / 1e6;
    expect(quarterRateToDisplay(100, '2026-04-01', 'sm3')).toBeCloseTo(expected, 9);
  });
});
