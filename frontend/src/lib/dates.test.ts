import { describe, expect, it } from 'vitest';
import {
  addMonths,
  daysInMonth,
  daysInQuarter,
  diffDays,
  monthRange,
  quarterMonths,
  quarterOf,
} from './dates';

describe('dates', () => {
  it('knows leap years', () => {
    expect(daysInMonth('2024-02-01')).toBe(29);
    expect(daysInMonth('2026-02-01')).toBe(28);
    expect(daysInMonth('2026-08-01')).toBe(31);
  });

  it('adds months across year boundaries', () => {
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('builds inclusive month ranges', () => {
    expect(monthRange('2026-06-01', '2026-08-01')).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
  });

  it('finds the quarter of a date', () => {
    expect(quarterOf('2026-08-15')).toEqual({
      year: 2026,
      q: 3,
      start: '2026-07-01',
      end: '2026-09-30',
    });
    expect(daysInQuarter('2026-07-01')).toBe(92);
    expect(quarterMonths('2026-10-01')).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('counts days between dates', () => {
    // Aker BP Q3 2026 trading update: quarter end 30 Sep → 14 Oct
    expect(diffDays('2026-09-30', '2026-10-14')).toBe(14);
  });
});
