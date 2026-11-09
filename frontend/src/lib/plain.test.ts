import { describe, expect, it } from 'vitest';
import type { ShelfSummary } from '@/api/types.summary';
import { homesHeated, KWH_PER_HOME_YEAR, largestOilField } from './plain';

const summary = (topFields: ShelfSummary['topFields']): ShelfSummary => ({
  month: '2026-08-01',
  boePerDay: 4_216_104,
  prevMonthBoePerDay: 4_197_525,
  yearAgoBoePerDay: 4_258_737,
  mix: { oil: 0.445, gas: 0.51, nglCond: 0.045 },
  producingFields: 94,
  stateBoePerDay: 1_065_161,
  stateShare: 0.2526,
  gasYear: 2025,
  gasYearBnSm3: 121.83,
  topFields,
  series: [],
});

describe('plain-language facts', () => {
  it('turns a year of gas into homes heated: bn m³ × 1e9 × 10.8 kWh ÷ 12,000 kWh', () => {
    expect(KWH_PER_HOME_YEAR).toBe(12_000);
    // 121.83 bn m³ of 2025 gas ≈ 110 million homes: the number on the landing page.
    expect(homesHeated(121.83) / 1e6).toBeCloseTo(109.6, 1);
    expect(homesHeated(0)).toBe(0);
  });

  it('picks the largest mostly-oil field and its change over a year', () => {
    const result = largestOilField(
      summary([
        { id: 1, name: 'Troll', boePerDay: 799_240, yearAgoBoePerDay: 765_430, oilShare: 0.02 },
        {
          id: 2,
          name: 'Johan Sverdrup',
          boePerDay: 618_125,
          yearAgoBoePerDay: 728_533,
          oilShare: 0.97,
        },
      ]),
    );
    expect(result?.field.name).toBe('Johan Sverdrup');
    expect(result?.yoyPct).toBeCloseTo(-15.2, 1);
  });

  it('says nothing rather than guess when the year-ago month is missing', () => {
    expect(
      largestOilField(
        summary([{ id: 2, name: 'New', boePerDay: 100, yearAgoBoePerDay: null, oilShare: 1 }]),
      ),
    ).toBeNull();
  });
});
