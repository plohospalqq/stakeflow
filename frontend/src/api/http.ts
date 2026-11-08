/**
 * Live API client. Calls relative /api/... (Vite dev proxy or nginx strip the prefix) and
 * maps the generated OpenAPI types into domain models, so the rest of the app never sees
 * wire formats.
 */
import { titleCaseName } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safeUrl';
import type { components } from './schema.gen';
import type {
  Company,
  CompanyDetail,
  CompanyFieldMonthly,
  FieldDetail,
  FieldMonthly,
  FieldOutlines,
  FieldSummary,
  Freshness,
  LatestSummary,
  LicenceShare,
  MonthRange,
  OutlineFeature,
  OutlineGeometry,
  ReportedQuarter,
} from './types';
import type { CoreApi } from './source';

type Schemas = components['schemas'];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`API ${status} on ${path}`);
    this.name = 'ApiError';
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

const BASE = '/api';

type Query = Record<string, string | number | boolean | undefined>;

async function get<T>(path: string, query: Query = {}, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new ApiError(res.status, path);
  // The response shape is guaranteed by the OpenAPI contract the types are generated from.
  return (await res.json()) as T; // eslint-disable-line @typescript-eslint/consistent-type-assertions -- JSON boundary: fetch returns untyped data
}

// --- mappers ---------------------------------------------------------------------------

export function mapLatest(latest: Schemas['LatestSummary'] | null): LatestSummary | null {
  if (!latest) return null;
  return {
    month: latest.month,
    oeSm3: latest.oeSm3,
    boePerDay: latest.boePerDay,
    prevMonthBoePerDay: latest.prevMonthBoePerDay,
    yearAgoBoePerDay: latest.yearAgoBoePerDay,
    mix: { oil: latest.oilShare, gas: latest.gasShare, nglCond: latest.nglCondensateShare },
  };
}

export function mapCompany(c: Schemas['CompanySummary']): Company {
  return {
    id: c.id,
    name: c.name,
    isFocus: c.isFocus,
    scopeNote: c.scopeNote,
    producingFieldCount: c.producingFieldCount,
    latest: mapLatest(c.latest),
  };
}

export function mapCompanyDetail(c: Schemas['CompanyDetail']): CompanyDetail {
  return {
    ...mapCompany(c),
    legalEntities: c.legalEntities.map((e) => ({
      companyId: e.companyId,
      name: e.name,
      nationCode: e.nationCode,
      factpageUrl: safeExternalUrl(e.factpageUrl),
    })),
  };
}

/** NGL and condensate become one product so the three stack exactly to total o.e. */
export function mapMonthly(p: Schemas['MonthlyPoint']): FieldMonthly {
  return {
    month: p.month,
    daysInMonth: p.daysInMonth,
    oilSm3: p.oilSm3,
    gasOeSm3: p.gasOeSm3,
    nglCondSm3: p.nglSm3 + p.condensateSm3,
    oeSm3: p.oeSm3,
    gasSm3: p.gasSm3,
  };
}

export function mapField(f: Schemas['FieldSummary']): FieldSummary {
  return {
    id: f.id,
    name: titleCaseName(f.name),
    status: f.status,
    hcType: f.hcType,
    // Sodir writes 'North sea'; the sea names are proper nouns.
    mainArea: f.mainArea ? titleCaseName(f.mainArea) : null,
    operator: f.operator,
    lon: f.lon,
    lat: f.lat,
    latest: mapLatest(f.latest),
  };
}

export function mapFieldDetail(f: Schemas['FieldDetail']): FieldDetail {
  return {
    ...mapField(f),
    discoveryYear: f.discoveryYear,
    areaKm2: f.areaKm2,
    firstProductionMonth: f.firstProductionMonth,
    lastProductionMonth: f.lastProductionMonth,
    factpageUrl: safeExternalUrl(f.factpageUrl),
    currentOwners: f.currentOwners.map((o) => ({ ...o })),
  };
}

export function mapQuarter(q: Schemas['QuarterReconciliation']): ReportedQuarter {
  return {
    quarterStart: q.quarterStart,
    monthsInData: q.monthsInData,
    isComplete: q.isComplete,
    attributedKboed: q.attributedKboeD,
    reportedKboed: q.reportedKboeD,
    errorPct: q.errorPct,
    reportedOn: q.reportedOn,
    sourceUrl: safeExternalUrl(q.sourceUrl),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRing(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.every((p) => Array.isArray(p) && p.every((n) => typeof n === 'number'))
  );
}

function isPolygonCoords(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every(isRing);
}

function isMultiPolygonCoords(value: unknown): value is number[][][][] {
  return Array.isArray(value) && value.every(isPolygonCoords);
}

function parseGeometry(value: unknown): OutlineGeometry | null {
  if (!isRecord(value)) return null;
  const { type, coordinates } = value;
  if (type === 'Polygon' && isPolygonCoords(coordinates)) return { type, coordinates };
  if (type === 'MultiPolygon' && isMultiPolygonCoords(coordinates)) return { type, coordinates };
  return null;
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** GeoJSON features arrive as open objects; keep only well-formed polygons. */
export function parseOutlines(fc: Schemas['FeatureCollection']): FieldOutlines {
  const features: OutlineFeature[] = [];
  for (const raw of fc.features) {
    const geometry = parseGeometry(raw.geometry);
    const props = raw.properties;
    if (!geometry || !isRecord(props) || typeof props.id !== 'number') continue;
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: props.id,
        name: titleCaseName(strOrNull(props.name) ?? ''),
        status: strOrNull(props.status) ?? '',
        operatorId: strOrNull(props.operatorId),
        boePerDay: numOrNull(props.boePerDay),
        oilShare: numOrNull(props.oilShare),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// --- client ----------------------------------------------------------------------------

const range = (r?: MonthRange): Query => ({ start: r?.start, end: r?.end });

export const httpCore: CoreApi = {
  async freshness() {
    const f = await get<Schemas['Freshness']>('/meta/freshness');
    return {
      latestMonth: f.latestMonth,
      lastRefreshAt: f.lastRefreshAt,
      source: f.source,
      licence: f.licence,
      recentPublicationLags: f.recentPublicationLags,
    } satisfies Freshness;
  },
  async companies(params) {
    const list = await get<Schemas['CompanySummary'][]>('/companies', {
      focus: params?.focus,
      limit: params?.limit,
    });
    return list.map(mapCompany);
  },
  async company(id) {
    return mapCompanyDetail(
      await get<Schemas['CompanyDetail']>(`/companies/${encodeURIComponent(id)}`),
    );
  },
  async companyProduction(id, r) {
    const list = await get<Schemas['MonthlyPoint'][]>(
      `/companies/${encodeURIComponent(id)}/production`,
      range(r),
    );
    return list.map(mapMonthly);
  },
  async companyFields(id, r) {
    const list = await get<Schemas['FieldMonthlyForCompany'][]>(
      `/companies/${encodeURIComponent(id)}/fields`,
      range(r),
    );
    return list.map((row): CompanyFieldMonthly => ({
      fieldId: row.fieldId,
      fieldName: titleCaseName(row.fieldName),
      month: row.month,
      sharePct: row.sharePct,
      oeSm3: row.oeSm3,
    }));
  },
  async companyQuarters(id, since) {
    const list = await get<Schemas['QuarterReconciliation'][]>(
      `/companies/${encodeURIComponent(id)}/quarters`,
      { since },
    );
    return list.map(mapQuarter);
  },
  async fields(params) {
    const list = await get<Schemas['FieldSummary'][]>('/fields', {
      status: params?.status,
      owner: params?.owner,
      limit: 500,
    });
    return list.map(mapField);
  },
  async field(id) {
    return mapFieldDetail(await get<Schemas['FieldDetail']>(`/fields/${id}`));
  },
  async fieldProduction(id, r) {
    const list = await get<Schemas['MonthlyPoint'][]>(`/fields/${id}/production`, range(r));
    return list.map(mapMonthly);
  },
  async fieldOwnership(id) {
    const list = await get<Schemas['OwnershipPeriod'][]>(`/fields/${id}/ownership`);
    return list.map((p): LicenceShare => ({ fieldId: id, ...p }));
  },
  async fieldOutlines() {
    return parseOutlines(await get<Schemas['FeatureCollection']>('/fields/geojson'));
  },
};
