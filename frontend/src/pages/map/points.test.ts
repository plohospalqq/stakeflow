import { describe, expect, it } from 'vitest';
import { mockCore } from '@/api/mock/core';
import { mockFieldTimeline } from '@/api/timeline';
import { mapPoints } from './points';

describe('mapPoints', () => {
  it('shows each field at its latest month until a month is picked', async () => {
    const fields = await mockCore.fields();
    const timeline = await mockFieldTimeline();
    const latest = mapPoints(fields, timeline, null);
    const sverdrup = fields.find((f) => f.name === 'Johan Sverdrup');
    expect(latest.find((p) => p.id === sverdrup?.id)?.kboed).toBeCloseTo(
      (sverdrup?.latest?.boePerDay ?? 0) / 1000,
      6,
    );
    // Before the timeline has loaded the map is not empty: it stays at the latest month.
    expect(mapPoints(fields, undefined, timeline.months[0] ?? null)).toEqual(latest);
  });

  it('follows the picked month: size and colour come from that month', async () => {
    const fields = await mockCore.fields();
    const timeline = await mockFieldTimeline();
    const first = timeline.months[0];
    const last = timeline.months[timeline.months.length - 1];
    if (!first || !last) throw new Error('empty timeline');
    const then = mapPoints(fields, timeline, first);
    const series = timeline.fields[0];
    if (!series) throw new Error('no fields');
    expect(then.find((p) => p.id === series.fieldId)?.kboed).toBeCloseTo(
      (series.boePerDay[0] ?? 0) / 1000,
      9,
    );
    expect(then.find((p) => p.id === series.fieldId)?.oilShare).toBe(series.oilShare[0]);
    // The last month of the timeline is the latest month of the field list.
    const now = mapPoints(fields, timeline, last);
    const latest = mapPoints(fields, timeline, null);
    expect(now.map((p) => p.id).sort()).toEqual(latest.map((p) => p.id).sort());
    for (const p of now) {
      expect(p.kboed).toBeCloseTo(latest.find((l) => l.id === p.id)?.kboed ?? -1, 3);
    }
  });

  it('leaves out a field in a month it did not produce', () => {
    const field = {
      id: 1,
      name: 'Young',
      status: 'Producing' as const,
      mainArea: null,
      hcType: null,
      operator: null,
      lon: 2,
      lat: 60,
      latest: null,
    };
    const timeline = {
      months: ['2026-07-01', '2026-08-01'],
      fields: [{ fieldId: 1, boePerDay: [0, 12_000], oilShare: [0, 0.9] }],
    };
    expect(mapPoints([field], timeline, '2026-07-01')).toEqual([]);
    expect(mapPoints([field], timeline, '2026-08-01')).toEqual([
      { id: 1, name: 'Young', lon: 2, lat: 60, kboed: 12, oilShare: 0.9 },
    ]);
  });
});
