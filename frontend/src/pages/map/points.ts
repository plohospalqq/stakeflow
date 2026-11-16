import type { FieldTimeline } from '@/api/timeline';
import type { FieldSummary, Month } from '@/api/types';
import type { MapPoint } from './FieldMapCanvas';

/**
 * The circles to draw: every field with a position that produced in `month`, sized and
 * coloured by that month. Without a month (or before the timeline has loaded, or for a month
 * it does not cover) it is each field's latest month, as the field list shows it.
 */
export function mapPoints(
  fields: FieldSummary[],
  timeline: FieldTimeline | undefined,
  month: Month | null,
): MapPoint[] {
  const at = timeline && month ? timeline.months.indexOf(month) : -1;
  const then = new Map(
    at >= 0
      ? timeline?.fields.map((f) => [
          f.fieldId,
          { boePerDay: f.boePerDay[at] ?? 0, oilShare: f.oilShare[at] ?? 0 },
        ])
      : [],
  );
  return fields.flatMap((f) => {
    const value =
      at >= 0
        ? then.get(f.id)
        : f.latest && { boePerDay: f.latest.boePerDay, oilShare: f.latest.mix.oil };
    if (f.lon === null || f.lat === null || !value || value.boePerDay <= 0) return [];
    return [
      {
        id: f.id,
        name: f.name,
        lon: f.lon,
        lat: f.lat,
        kboed: value.boePerDay / 1000,
        oilShare: value.oilShare,
      },
    ];
  });
}
