import { describe, expect, it } from 'vitest';
import {
  MINUS,
  formatMonth,
  formatMonthShort,
  formatPct,
  formatQuarter,
  formatUtc,
  formatVolume,
  titleCaseName,
} from './format';

describe('format', () => {
  it('uses a real minus sign', () => {
    expect(formatPct(-0.74, 2)).toBe(`${MINUS}0.74%`);
    expect(formatPct(2.1, 1, true)).toBe('+2.1%');
  });

  it('formats volumes by size and unit', () => {
    expect(formatVolume(1382.4, 'boe')).toBe('1,382');
    expect(formatVolume(98.44, 'boe')).toBe('98.4');
    expect(formatVolume(0.4123, 'sm3')).toBe('0.412');
    expect(formatVolume(7.2111, 'sm3')).toBe('7.21');
  });

  it('formats months and quarters', () => {
    expect(formatMonth('2026-09-01')).toBe('Sep 2026');
    expect(formatMonthShort('2025-08-01')).toBe('Aug 25');
    expect(formatQuarter('2026-07-01')).toBe('Q3 2026');
  });

  it('formats UTC timestamps', () => {
    expect(formatUtc('2026-09-30T23:59:00Z')).toBe('2026-09-30 23:59 UTC');
  });

  it('title-cases Sodir field names', () => {
    expect(titleCaseName('JOHAN SVERDRUP')).toBe('Johan Sverdrup');
    expect(titleCaseName('ÆRFUGL NORD')).toBe('Ærfugl Nord');
    expect(titleCaseName('TOR II')).toBe('Tor II');
    expect(titleCaseName('OSEBERG SØR')).toBe('Oseberg Sør');
  });
});
