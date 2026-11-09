import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, isNotFound } from '../http';
import { parseDataSource } from '../mode';
import { narrow, resolveMonthRange, staticCore, staticRoute, type StaticRoute } from '../static';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDataSource', () => {
  it('defaults to the live API and accepts static', () => {
    expect(parseDataSource({})).toBe('api');
    expect(parseDataSource({ VITE_DATA_SOURCE: 'static' })).toBe('static');
    expect(parseDataSource({ VITE_DATA_SOURCE: 'nonsense' })).toBe('api');
  });

  it('keeps VITE_USE_MOCKS=true as the way to mock everything', () => {
    expect(parseDataSource({ VITE_USE_MOCKS: 'true', VITE_DATA_SOURCE: 'static' })).toBe('mocks');
    expect(parseDataSource({ VITE_DATA_SOURCE: 'mocks' })).toBe('mocks');
  });
});

describe('staticRoute', () => {
  it.each<[string, Record<string, string | number | boolean | undefined>, StaticRoute]>([
    ['/meta/freshness', {}, { file: 'meta/freshness.json' }],
    ['/companies', { focus: true }, { file: 'companies/focus.json', limit: undefined }],
    ['/companies', { focus: false, limit: 200 }, { file: 'companies/all.json', limit: 200 }],
    ['/companies/aker-bp', {}, { file: 'companies/aker-bp/detail.json' }],
    [
      '/companies/aker-bp/production',
      { start: '2026-07-01' },
      { file: 'companies/aker-bp/production.json', series: 'company' },
    ],
    ['/companies/equinor/fields', {}, { file: 'companies/equinor/fields.json', series: 'company' }],
    [
      '/companies/var-energi/quarters',
      {},
      { file: 'companies/var-energi/quarters.json', since: undefined },
    ],
    [
      '/fields',
      { status: 'Producing', limit: 500 },
      { file: 'fields/all.json', status: 'Producing', limit: 500 },
    ],
    [
      '/fields',
      { owner: 'aker-bp', limit: 500 },
      { file: 'fields/owner/aker-bp.json', status: undefined, limit: 500 },
    ],
    ['/fields/geojson', {}, { file: 'fields/geojson.json' }],
    ['/fields/43506', {}, { file: 'fields/43506/detail.json' }],
    ['/fields/43506/production', {}, { file: 'fields/43506/production.json', series: 'field' }],
    ['/fields/43506/ownership', {}, { file: 'fields/43506/ownership.json' }],
  ])('maps %s %o to its file', (path, query, route) => {
    expect(staticRoute(path, query)).toEqual(route);
  });

  it.each([
    '/companies/Aker%20BP',
    '/companies/..%2F..%2Fsecrets',
    '/companies/aker-bp/unknown',
    '/fields/1.5',
    '/fields/abc/production',
    '/fields/1/production/extra',
    '/nowcasts',
  ])('has no file for %s', (path) => {
    expect(staticRoute(path)).toBeNull();
  });

  it('rejects an owner that is not a company id', () => {
    expect(staticRoute('/fields', { owner: '../all' })).toBeNull();
  });
});

describe('resolveMonthRange', () => {
  it('defaults to the 36 months up to the newest month, like the API', () => {
    expect(resolveMonthRange({}, '2026-08-01')).toEqual({ start: '2023-09-01', end: '2026-08-01' });
  });

  it('snaps explicit dates to the first of the month', () => {
    expect(resolveMonthRange({ start: '2026-07-15', end: '2026-08-31' }, '2026-08-01')).toEqual({
      start: '2026-07-01',
      end: '2026-08-01',
    });
  });
});

describe('narrow', () => {
  const info = {
    latestMonth: '2026-08-01',
    seriesStart: { company: '2023-09-01', field: '2001-08-01' },
  };
  const months = ['2023-09-01', '2026-06-01', '2026-07-01', '2026-08-01'].map((month) => ({
    month,
  }));
  const series: StaticRoute = { file: 'x.json', series: 'company' };

  it('cuts a series to the requested months', () => {
    expect(narrow(months, series, { start: '2026-07-01' }, info, '/p')).toEqual([
      { month: '2026-07-01' },
      { month: '2026-08-01' },
    ]);
    expect(narrow(months, series, {}, info, '/p')).toHaveLength(4);
  });

  it('answers start after end with 422, like the API', () => {
    expect(() =>
      narrow(months, series, { start: '2026-08-01', end: '2026-01-01' }, info, '/p'),
    ).toThrow(new ApiError(422, '/p'));
  });

  it('refuses months before the exported window instead of returning a cut series', () => {
    expect(() => narrow(months, series, { start: '2020-01-01' }, info, '/p')).toThrow(
      new ApiError(416, '/p'),
    );
  });

  it('filters by status and since, then applies the limit', () => {
    const fields = [
      { status: 'Producing' },
      { status: 'Shut down' },
      { status: 'Producing' },
      { status: 'Producing' },
    ];
    const route: StaticRoute = { file: 'f.json', status: 'Producing', limit: 2 };
    expect(narrow(fields, route, {}, info, '/fields')).toEqual([
      { status: 'Producing' },
      { status: 'Producing' },
    ]);
    const quarters = [{ quarterStart: '2025-10-01' }, { quarterStart: '2026-04-01' }];
    expect(narrow(quarters, { file: 'q.json', since: '2026-01-01' }, {}, info, '/q')).toEqual([
      { quarterStart: '2026-04-01' },
    ]);
  });
});

describe('staticCore', () => {
  const snapshot = {
    generatedAt: '2026-11-09T11:45:35+00:00',
    latestMonth: '2026-08-01',
    source: 'live',
    seriesStart: { company: '2023-09-01', field: '2001-08-01' },
  };
  const point = (month: string) => ({
    month,
    daysInMonth: 31,
    oilSm3: 10,
    gasSm3: 2000,
    gasOeSm3: 2,
    nglSm3: 1,
    condensateSm3: 1,
    oeSm3: 14,
    boePerDay: 2.84,
  });

  function serve(files: Record<string, unknown>) {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url in files
          ? new Response(JSON.stringify(files[url]), { status: 200 })
          : new Response('<!doctype html>', { status: 404 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('reads the exported file under the app base and maps it like the live API', async () => {
    const fetchMock = serve({
      '/data/meta/snapshot.json': snapshot,
      '/data/companies/aker-bp/production.json': [
        point('2026-06-01'),
        point('2026-07-01'),
        point('2026-08-01'),
      ],
    });
    const result = await staticCore.companyProduction('aker-bp', { start: '2026-07-01' });
    expect(result.map((p) => p.month)).toEqual(['2026-07-01', '2026-08-01']);
    expect(result[0]?.nglCondSm3).toBe(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain(
      '/data/companies/aker-bp/production.json',
    );
  });

  it('turns a missing file into a recognisable 404', async () => {
    serve({ '/data/meta/snapshot.json': snapshot });
    const error: unknown = await staticCore.field(999).catch((e: unknown) => e);
    expect(isNotFound(error)).toBe(true);
  });

  it('answers an unknown id with 404 without a request', async () => {
    const fetchMock = serve({});
    const error: unknown = await staticCore.company('No Such Co').catch((e: unknown) => e);
    expect(isNotFound(error)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
