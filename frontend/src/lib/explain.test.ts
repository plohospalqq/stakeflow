import { describe, expect, it } from 'vitest';
import type { CompanyFieldMonthly } from '@/api/types';
import { explainChange, fieldMoves } from './explain';
import { plateau } from './fieldStats';
import { latestView } from './latest';

const row = (fieldName: string, month: string, oeSm3: number): CompanyFieldMonthly => ({
  fieldId: fieldName.length,
  fieldName,
  month,
  sharePct: 50,
  oeSm3,
});

const identity = (sm3: number) => sm3;

describe('explainChange', () => {
  it('names the field behind a move in the same direction', () => {
    const moves = fieldMoves(
      [
        row('Johan Sverdrup', '2026-08-01', 90),
        row('Johan Sverdrup', '2026-07-01', 100),
        row('Skarv', '2026-08-01', 21),
        row('Skarv', '2026-07-01', 20),
      ],
      '2026-08-01',
      '2026-07-01',
      identity,
    );
    expect(explainChange(moves, '2026-07-01', 'kboe/d')).toBe(
      'Down 9.0 kboe/d on Jul, mostly Johan Sverdrup (−10.0).',
    );
  });

  it('explains a move that went against the biggest single field', () => {
    const moves = [
      { fieldName: 'Edvard Grieg', change: -3 },
      { fieldName: 'Skarv', change: 2.5 },
      { fieldName: 'Valhall', change: 2 },
    ];
    expect(explainChange(moves, '2026-07-01', 'kboe/d')).toBe(
      'Up 1.5 kboe/d on Jul despite Edvard Grieg (−3.0); Skarv rose the most (+2.5).',
    );
  });

  it('returns null without data', () => {
    expect(explainChange([], '2026-07-01', 'kboe/d')).toBeNull();
  });
});

describe('latestView', () => {
  it('computes deltas in the display unit', () => {
    const view = latestView(
      {
        month: '2026-08-01',
        oeSm3: 1_831_282,
        boePerDay: 371_561,
        prevMonthBoePerDay: 376_261,
        yearAgoBoePerDay: 423_575,
        mix: { oil: 0.84, gas: 0.13, nglCond: 0.03 },
      },
      'boe',
    );
    expect(view.value).toBeCloseTo(371.56, 1);
    expect(view.momPct).toBeCloseTo((371_561 / 376_261 - 1) * 100, 1);
    expect(view.yoyPct).toBeCloseTo((371_561 / 423_575 - 1) * 100, 1);
  });
});

describe('plateau', () => {
  it('finds the best 12-month average and the years near it', () => {
    const series = Array.from({ length: 60 }, (_, i) => ({
      month: `${2021 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
      value: i < 12 ? 50 : i < 48 ? 100 : 80,
    }));
    const p = plateau(series);
    expect(p?.value).toBe(100);
    expect(p?.fromYear).toBe(2022);
    expect(p?.toYear).toBe(2024);
  });
});
