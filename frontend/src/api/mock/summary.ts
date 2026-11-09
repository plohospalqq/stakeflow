/**
 * Mock GET /summary, computed from the mock core the same way the API computes it from the
 * marts: latest-month totals, the state's share through Petoro, last full year of gas,
 * the five largest fields and 24 months of shelf production.
 */
import { addMonths, daysInMonth, monthRange } from '@/lib/dates';
import { sm3ToKboed } from '@/lib/units';
import type { ShelfSummary } from '../types.summary';
import { MOCK_LATEST_MONTH, mockCore } from './core';
import { SEED_FIELDS } from './seedFields';

const STATE_GROUP = 'petoro';

export async function mockSummary(): Promise<ShelfSummary> {
  const latest = MOCK_LATEST_MONTH;
  const first = addMonths(latest, -23);
  const gasYear = Number(latest.slice(0, 4)) - 1;
  const fields = (await mockCore.fields()).filter((f) => f.latest && f.latest.boePerDay > 0);

  const total = fields.reduce((s, f) => s + (f.latest?.boePerDay ?? 0), 0);
  const weighted = (pick: (mix: { oil: number; gas: number; nglCond: number }) => number) =>
    fields.reduce((s, f) => s + (f.latest ? pick(f.latest.mix) * f.latest.boePerDay : 0), 0) /
    (total || 1);
  const sumOf = (pick: (f: (typeof fields)[number]) => number | null) =>
    fields.reduce((s, f) => s + (pick(f) ?? 0), 0);

  const stateBoePerDay = fields.reduce((s, f) => {
    const seed = SEED_FIELDS.find((x) => x.id === f.id);
    const share = seed?.owners.find(([g]) => g === STATE_GROUP)?.[1] ?? 0;
    return s + ((f.latest?.boePerDay ?? 0) * share) / 100;
  }, 0);

  const months = monthRange(first, latest);
  const byMonth = new Map(months.map((m) => [m, 0]));
  let gasSm3 = 0;
  for (const f of fields) {
    const history = await mockCore.fieldProduction(f.id, {
      start: `${gasYear}-01-01`,
      end: latest,
    });
    for (const p of history) {
      if (p.month.startsWith(String(gasYear))) gasSm3 += p.gasSm3;
      if (byMonth.has(p.month)) byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.oeSm3);
    }
  }

  return {
    month: latest,
    boePerDay: total,
    prevMonthBoePerDay: sumOf((f) => f.latest?.prevMonthBoePerDay ?? null),
    yearAgoBoePerDay: sumOf((f) => f.latest?.yearAgoBoePerDay ?? null),
    mix: {
      oil: weighted((m) => m.oil),
      gas: weighted((m) => m.gas),
      nglCond: weighted((m) => m.nglCond),
    },
    producingFields: fields.length,
    stateBoePerDay,
    stateShare: stateBoePerDay / (total || 1),
    gasYear,
    gasYearBnSm3: gasSm3 / 1e9,
    topFields: [...fields]
      .sort((a, b) => (b.latest?.boePerDay ?? 0) - (a.latest?.boePerDay ?? 0))
      .slice(0, 5)
      .map((f) => ({
        id: f.id,
        name: f.name,
        boePerDay: f.latest?.boePerDay ?? 0,
        yearAgoBoePerDay: f.latest?.yearAgoBoePerDay ?? null,
        oilShare: f.latest?.mix.oil ?? 0,
      })),
    series: months.map((month) => ({
      month,
      boePerDay: sm3ToKboed(byMonth.get(month) ?? 0, daysInMonth(month)) * 1000,
    })),
  };
}
