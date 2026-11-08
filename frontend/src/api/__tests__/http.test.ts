import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, httpCore, isNotFound, mapMonthly, parseOutlines } from '../http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapMonthly', () => {
  it('merges NGL and condensate so the three products add up to total o.e.', () => {
    const m = mapMonthly({
      month: '2026-08-01',
      daysInMonth: 31,
      oilSm3: 2_955_506,
      gasSm3: 61_814_000,
      gasOeSm3: 61_814,
      nglSm3: 29_000,
      condensateSm3: 181,
      oeSm3: 3_046_501,
      boePerDay: 618_125.2,
    });
    expect(m.nglCondSm3).toBe(29_181);
    expect(m.oilSm3 + m.gasOeSm3 + m.nglCondSm3).toBeCloseTo(m.oeSm3, 6);
  });
});

describe('parseOutlines', () => {
  it('keeps valid polygons and drops malformed features', () => {
    const fc = parseOutlines({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2, 58],
                [3, 58],
                [3, 59],
                [2, 58],
              ],
            ],
          },
          properties: {
            id: 1,
            name: 'JOHAN SVERDRUP',
            status: 'Producing',
            operatorId: 'equinor',
            boePerDay: 1,
            oilShare: 0.97,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { id: 2 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [['x']] },
          properties: { id: 3 },
        },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
      ],
    });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties.name).toBe('Johan Sverdrup');
  });
});

describe('httpCore', () => {
  it('calls the relative /api path with query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await httpCore.companies({ focus: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/companies?focus=true');
  });

  it('turns HTTP errors into ApiError, with 404 recognisable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const error: unknown = await httpCore.field(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isNotFound(error)).toBe(true);
  });
});
