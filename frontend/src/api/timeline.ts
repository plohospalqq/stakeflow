/**
 * GET /fields/timeline: every field's production over the last 24 months, so the map's
 * circles can follow the month picked on the timeline. Same shape in every data mode: the
 * live API, the exported file of the static demo, and the mock computed from the mock core.
 */
import { addMonths, daysInMonth, monthRange } from '@/lib/dates';
import { sm3ToKboed } from '@/lib/units';
import { ApiError } from './http';
import { MOCK_LATEST_MONTH, mockCore } from './mock/core';
import type { components } from './schema.gen';
import type { Month } from './types';

type Wire = components['schemas']['FieldTimeline'];

export interface FieldTimeline {
  /** Oldest first; the last one is the latest month of data. */
  months: Month[];
  /** One value per month; 0 where the field did not produce. */
  fields: { fieldId: number; boePerDay: number[]; oilShare: number[] }[];
}

export const TIMELINE_MONTHS = 24;

export function mapFieldTimeline(w: Wire): FieldTimeline {
  return {
    months: [...w.months],
    fields: w.fields.map((f) => ({
      fieldId: f.fieldId,
      boePerDay: [...f.boePerDay],
      oilShare: [...f.oilShare],
    })),
  };
}

export async function fetchFieldTimeline(): Promise<FieldTimeline> {
  const path = '/fields/timeline';
  const res = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, path);
  // The response shape is guaranteed by the OpenAPI contract the types are generated from.
  return mapFieldTimeline((await res.json()) as Wire); // eslint-disable-line @typescript-eslint/consistent-type-assertions -- JSON boundary: fetch returns untyped data
}

export async function mockFieldTimeline(): Promise<FieldTimeline> {
  const months = monthRange(
    addMonths(MOCK_LATEST_MONTH, -(TIMELINE_MONTHS - 1)),
    MOCK_LATEST_MONTH,
  );
  const range = { start: months[0], end: MOCK_LATEST_MONTH };
  const fields = await Promise.all(
    (await mockCore.fields()).map(async (f) => {
      const history = new Map(
        (await mockCore.fieldProduction(f.id, range)).map((p) => [p.month, p]),
      );
      const at = months.map((month) => history.get(month));
      return {
        fieldId: f.id,
        boePerDay: at.map((p) =>
          p && p.oeSm3 > 0 ? sm3ToKboed(p.oeSm3, daysInMonth(p.month)) * 1000 : 0,
        ),
        oilShare: at.map((p) => (p && p.oeSm3 > 0 ? Math.min(1, p.oilSm3 / p.oeSm3) : 0)),
      };
    }),
  );
  return { months, fields: fields.filter((f) => f.boePerDay.some((v) => v > 0)) };
}
