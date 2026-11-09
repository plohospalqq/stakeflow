/**
 * Static demo source (VITE_DATA_SOURCE=static): the CoreApi and the public extras over JSON
 * files exported from the real API at build time (api/scripts/export_static.py), served next
 * to the app on GitHub Pages. Each API path maps to one file holding that endpoint's exact
 * response, so http.ts and extras.ts map them into domain models unchanged. Query parameters
 * that only narrow a list (month range, status, limit, since, series) are applied here, with
 * the API's own rules. Share prices and scenario results are never exported (Euronext data).
 */
import type { components } from './schema.gen';
import { mapSummary } from './summary';
import type { ShelfSummary } from './types.summary';
import { addMonths, monthStart } from '@/lib/dates';
import { createExtras } from './extras';
import { ApiError, createCore, type JsonPoster, type Query } from './http';
import type { CoreApi, ExtrasApi } from './source';

/** meta/snapshot.json: written by the exporter next to the API responses. */
export interface SnapshotInfo {
  /** When the exporter ran (UTC ISO timestamp). */
  generatedAt: string;
  /** Newest month in the data, 'YYYY-MM-01'. */
  latestMonth: string;
  /** 'live' = built from the Sodir API; 'ci-fixture' = the offline CI snapshot (Sodir was down). */
  source: string;
  /** First month each series file holds; earlier ranges cannot be answered. */
  seriesStart: { company: string; field: string };
}

type SeriesKind = keyof SnapshotInfo['seriesStart'];

export interface StaticRoute {
  /** Path under data/, e.g. 'fields/123/detail.json'. */
  file: string;
  /** A monthly series: cut to the requested month range. */
  series?: SeriesKind;
  /** /fields?status= is a filter on the full list. */
  status?: string;
  /** /companies/{id}/quarters?since= */
  since?: string;
  /** /prices?series=brent&series=ttf: keep only these ids. */
  ids?: string[];
  limit?: number;
}

/** Same shapes the API accepts; anything else is a 404 without a request. */
const COMPANY_ID = /^[a-z0-9][a-z0-9-]*$/;
const FIELD_ID = /^[0-9]+$/;

const str = (v: Query[string]): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: Query[string]): number | undefined => (typeof v === 'number' ? v : undefined);
const list = (v: Query[string]): string[] | undefined =>
  Array.isArray(v) ? v : typeof v === 'string' ? [v] : undefined;

/** Which file answers an API path (as http.ts builds it), or null for an unknown path. */
export function staticRoute(path: string, query: Query = {}): StaticRoute | null {
  const [root, id, sub, ...rest] = path.split('/').filter(Boolean);
  if (rest.length > 0) return null;

  if (root === 'meta' && id === 'freshness' && !sub) return { file: 'meta/freshness.json' };
  if (root === 'summary' && !id) return { file: 'meta/summary.json' };

  // Models and markets: one file each, exported as the API answers them.
  if (root === 'nowcasts' && !id) return { file: 'models/nowcasts.json' };
  // Only the newest row per quarter is exported, the way every page asks for it.
  if (root === 'predictions' && !id && query.latest === true) {
    return { file: 'models/predictions.json' };
  }
  if (root === 'anomalies' && !id) return { file: 'anomalies/all.json', limit: num(query.limit) };
  if (root === 'prices' && !id) return { file: 'prices/series.json', ids: list(query.series) };
  if (root === 'prices' && id === 'latest' && !sub) return { file: 'prices/latest.json' };

  if (root === 'companies') {
    if (!id) {
      return {
        file: query.focus === true ? 'companies/focus.json' : 'companies/all.json',
        limit: num(query.limit),
      };
    }
    if (!COMPANY_ID.test(id)) return null;
    if (!sub) return { file: `companies/${id}/detail.json` };
    if (sub === 'production' || sub === 'fields') {
      return { file: `companies/${id}/${sub}.json`, series: 'company' };
    }
    if (sub === 'quarters')
      return { file: `companies/${id}/quarters.json`, since: str(query.since) };
    return null;
  }

  if (root === 'fields') {
    if (!id) {
      const owner = str(query.owner);
      if (owner !== undefined && !COMPANY_ID.test(owner)) return null;
      return {
        file: owner ? `fields/owner/${owner}.json` : 'fields/all.json',
        status: str(query.status),
        limit: num(query.limit),
      };
    }
    if (id === 'geojson' && !sub) return { file: 'fields/geojson.json' };
    if (!FIELD_ID.test(id)) return null;
    if (!sub) return { file: `fields/${id}/detail.json` };
    if (sub === 'production') return { file: `fields/${id}/production.json`, series: 'field' };
    if (sub === 'ownership') return { file: `fields/${id}/ownership.json` };
    if (sub === 'forecast') return { file: `fields/${id}/forecast.json` };
  }
  return null;
}

/** The API's month_range: end defaults to the newest month, start to 36 months before end. */
export function resolveMonthRange(
  query: Query,
  latestMonth: string,
): { start: string; end: string } {
  const endParam = str(query.end);
  const startParam = str(query.start);
  const end = monthStart(endParam ?? latestMonth);
  const start = startParam ? monthStart(startParam) : addMonths(end, -35);
  return { start, end };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Applies the route's narrowing parameters to a list response, the way the API would. */
export function narrow(
  rows: unknown[],
  route: StaticRoute,
  query: Query,
  info: Pick<SnapshotInfo, 'latestMonth' | 'seriesStart'>,
  path: string,
): unknown[] {
  let out = rows;
  if (route.series) {
    const { start, end } = resolveMonthRange(query, info.latestMonth);
    if (start > end) throw new ApiError(422, path);
    // The file holds a window of months; never pass off a cut series as complete.
    if (start < info.seriesStart[route.series]) throw new ApiError(416, path);
    out = out.filter(
      (r) => isRecord(r) && typeof r.month === 'string' && r.month >= start && r.month <= end,
    );
  }
  const { status, since, ids } = route;
  if (status) out = out.filter((r) => isRecord(r) && r.status === status);
  if (ids) out = out.filter((r) => isRecord(r) && typeof r.id === 'string' && ids.includes(r.id));
  if (since) {
    out = out.filter(
      (r) => isRecord(r) && typeof r.quarterStart === 'string' && r.quarterStart >= since,
    );
  }
  if (route.limit !== undefined) out = out.slice(0, route.limit);
  return out;
}

const dataUrl = (file: string): string => `${import.meta.env.BASE_URL}data/${file}`;

async function fetchJson(file: string, path: string): Promise<unknown> {
  const res = await fetch(dataUrl(file), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, path);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- JSON boundary: fetch returns untyped data
  return (await res.json()) as unknown;
}

let snapshotInfo: Promise<SnapshotInfo> | null = null;

/** Snapshot metadata, fetched once (a failed fetch is retried on the next call). */
export function staticSnapshotInfo(): Promise<SnapshotInfo> {
  snapshotInfo ??= fetchJson('meta/snapshot.json', '/meta/snapshot').then(
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- written by our own exporter
    (body) => body as SnapshotInfo,
    (error: unknown) => {
      snapshotInfo = null;
      throw error;
    },
  );
  return snapshotInfo;
}

async function getStatic<T>(path: string, query: Query = {}): Promise<T> {
  const route = staticRoute(path, query);
  if (!route) throw new ApiError(404, path);
  const body = await fetchJson(route.file, path);
  const isList = Array.isArray(body);
  const result = isList ? narrow(body, route, query, await staticSnapshotInfo(), path) : body;
  // The files are the API's own responses, so the OpenAPI contract describes them too.
  return result as T; // eslint-disable-line @typescript-eslint/consistent-type-assertions -- JSON boundary
}

export const staticCore: CoreApi = createCore(getStatic);

/** There is no server behind the demo to send a question to. */
const postStatic: JsonPoster = (path) => Promise.reject(new ApiError(404, path));

/**
 * Every extra over the exported files. Only the public ones are used (mode.ts,
 * STATIC_REAL_EXTRAS); index.ts takes the rest from the mock layer.
 */
export const staticExtras: ExtrasApi = createExtras(getStatic, postStatic);

/** The landing page's shelf summary from the snapshot (same mapper as the live API). */
export async function staticSummary(): Promise<ShelfSummary> {
  return mapSummary(await getStatic<components['schemas']['ShelfSummary']>('/summary'));
}
