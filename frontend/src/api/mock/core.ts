/**
 * Mock implementation of the backend API (VITE_USE_MOCKS=true). Field facts and owners
 * are real (seedFields.ts); every production number is synthetic but deterministic, and
 * company numbers are computed from fields × day-weighted shares exactly like the
 * pipeline does, so the mock is internally consistent.
 */
import { addDays, addMonths, daysInMonth, monthRange, quarterOf } from '@/lib/dates';
import { titleCaseName } from '@/lib/format';
import { effectiveSharePct } from '@/lib/ownership';
import { seededRandom } from '@/lib/random';
import { kboedToSm3, sm3ToKboed } from '@/lib/units';
import { ApiError } from '../http';
import type { CoreApi } from '../source';
import type {
  Company,
  CompanyDetail,
  CompanyFieldMonthly,
  FieldDetail,
  FieldMonthly,
  FieldOutlines,
  FieldSummary,
  LatestSummary,
  LicenceShare,
  MonthRange,
  ReportedQuarter,
} from '../types';
import { SEED_FIELDS, SEED_GROUPS, type SeedField } from './seedFields';

export const MOCK_LATEST_MONTH = '2026-08-01';
const HISTORY_START = '2014-01-01';
const DEFAULT_MONTHS = 36;

export const FOCUS_IDS = ['equinor', 'var-energi', 'aker-bp'];

const SCOPE_NOTES: Record<string, string> = {
  equinor:
    "Norwegian shelf only. Excludes Equinor's international, trading and renewables business; never compare with group totals.",
  'var-energi':
    'From 2018-12-10 (Eni Norge + Point Resources). Re-check scope if the BlueNord combination closes.',
  'aker-bp':
    'Includes predecessor Det norske oljeselskap and ABP Norway AS (ex-Lundin assets from 2022-06-30).',
};

const LEGAL_ENTITIES: Record<string, string[]> = {
  equinor: ['Equinor Energy AS'],
  'var-energi': ['Vår Energi ASA'],
  'aker-bp': ['Aker BP ASA', 'ABP Norway AS'],
};

/** Lundin's NCS assets moved to Aker BP on 2022-06-30: the one ownership change mocked. */
const LUNDIN_DEAL = '2022-06-30';
const LUNDIN_SHARES: Record<number, number> = { 26376286: 20, 21675433: 65, 23384520: 1.385 };

function companyNumber(groupId: string): number {
  return (10_000_000 + seededRandom(groupId)() * 9_000_000) | 0;
}

function groupName(groupId: string): string {
  if (groupId === 'lundin') return 'Lundin';
  return SEED_GROUPS[groupId] ?? groupId;
}

function ownershipOf(seed: SeedField): LicenceShare[] {
  const from = `${Math.max(2005, Number(seed.firstProductionMonth.slice(0, 4)) - 3)}-01-01`;
  const lundin = LUNDIN_SHARES[seed.id];
  const periods: LicenceShare[] = [];
  const add = (groupId: string, sharePct: number, validFrom: string, validTo: string | null) =>
    periods.push({
      fieldId: seed.id,
      companyId: companyNumber(groupId),
      companyName: groupName(groupId),
      groupId,
      groupName: groupName(groupId),
      sharePct,
      validFrom,
      validTo,
    });
  for (const [groupId, share] of seed.owners) {
    if (lundin && groupId === 'aker-bp') {
      const before = Math.round((share - lundin) * 10_000) / 10_000;
      if (before > 0) add(groupId, before, from, LUNDIN_DEAL);
      add(groupId, share, LUNDIN_DEAL, null);
    } else {
      add(groupId, share, from, null);
    }
  }
  if (lundin) add('lundin', lundin, from, LUNDIN_DEAL);
  return periods;
}

/**
 * Synthetic monthly history shaped around the field's real latest level: ramp-up after
 * first production, a trend that reproduces the real year-on-year change, seasonal gas
 * swing, noise and the odd maintenance month.
 */
function generateField(seed: SeedField): FieldMonthly[] {
  const rand = seededRandom(seed.id);
  const first =
    seed.firstProductionMonth > HISTORY_START ? seed.firstProductionMonth : HISTORY_START;
  const months = monthRange(first, MOCK_LATEST_MONTH);
  const latest = seed.latestKboed;
  const yearAgo = seed.yearAgoKboed > 0 ? seed.yearAgoKboed : latest;
  const trend = Math.max(-0.3, Math.min(0.3, Math.log(yearAgo / latest)));
  const nglCondShare = Math.max(0, 1 - seed.oilShare - seed.gasShare);
  const gassy = seed.gasShare > 0.5;

  return months.map((month, i) => {
    const yearsBack = (months.length - 1 - i) / 12;
    const monthsOn = i + (first === seed.firstProductionMonth ? 0 : 24);
    const ramp = Math.min(1, (monthsOn + 1) / 10);
    // Growth only explains the recent past; older history sits on a plateau.
    const level =
      trend > 0
        ? latest * Math.exp(trend * yearsBack)
        : latest * Math.exp(trend * Math.min(yearsBack, 2));
    const m = Number(month.slice(5, 7));
    const season = gassy ? (m <= 2 || m === 12 ? 1.06 : m >= 6 && m <= 8 ? 0.93 : 1) : 1;
    const maintenance = rand() < 0.035 ? 0.7 + rand() * 0.15 : 1;
    const noise = 1 + (rand() - 0.5) * 0.05;
    const isLatest = month === MOCK_LATEST_MONTH;
    const kboed = isLatest ? latest : level * ramp * season * maintenance * noise;
    const oe = kboedToSm3(kboed, daysInMonth(month));
    const gasOe = oe * seed.gasShare;
    return {
      month,
      daysInMonth: daysInMonth(month),
      oilSm3: oe * seed.oilShare,
      gasOeSm3: gasOe,
      nglCondSm3: oe * nglCondShare,
      oeSm3: oe,
      gasSm3: gasOe * 1000,
    };
  });
}

const fieldCache = new Map<number, FieldMonthly[]>();
function fieldHistory(seed: SeedField): FieldMonthly[] {
  let history = fieldCache.get(seed.id);
  if (!history) {
    history = generateField(seed);
    fieldCache.set(seed.id, history);
  }
  return history;
}

function findSeed(id: number): SeedField {
  const seed = SEED_FIELDS.find((f) => f.id === id);
  if (!seed) throw new ApiError(404, `/fields/${id}`);
  return seed;
}

function inRange(month: string, range?: MonthRange): boolean {
  const start = range?.start ?? addMonths(MOCK_LATEST_MONTH, -(DEFAULT_MONTHS - 1));
  const end = range?.end ?? MOCK_LATEST_MONTH;
  return month >= start && month <= end;
}

function latestOf(
  history: { month: string; oeSm3: number; oilSm3: number; gasOeSm3: number; nglCondSm3: number }[],
): LatestSummary | null {
  const last = history[history.length - 1];
  if (!last || last.oeSm3 <= 0) return null;
  const rate = (m: string) => {
    const point = history.find((h) => h.month === m);
    return point ? sm3ToKboed(point.oeSm3, daysInMonth(m)) * 1000 : null;
  };
  return {
    month: last.month,
    oeSm3: last.oeSm3,
    boePerDay: sm3ToKboed(last.oeSm3, daysInMonth(last.month)) * 1000,
    prevMonthBoePerDay: rate(addMonths(last.month, -1)),
    yearAgoBoePerDay: rate(addMonths(last.month, -12)),
    mix: {
      oil: last.oilSm3 / last.oeSm3,
      gas: last.gasOeSm3 / last.oeSm3,
      nglCond: last.nglCondSm3 / last.oeSm3,
    },
  };
}

function toSummary(seed: SeedField): FieldSummary {
  return {
    id: seed.id,
    name: titleCaseName(seed.name),
    status: seed.status,
    hcType: seed.hcType,
    mainArea: titleCaseName(seed.mainArea),
    operator: { id: seed.operatorId, name: groupName(seed.operatorId) },
    lon: seed.lon,
    lat: seed.lat,
    latest: latestOf(fieldHistory(seed)),
  };
}

/** Net-to-company rows for every field the group has ever held. */
function companyFieldRows(groupId: string): CompanyFieldMonthly[] {
  const rows: CompanyFieldMonthly[] = [];
  for (const seed of SEED_FIELDS) {
    const periods = ownershipOf(seed);
    if (!periods.some((p) => p.groupId === groupId)) continue;
    for (const point of fieldHistory(seed)) {
      const share = effectiveSharePct(periods, groupId, point.month);
      if (share <= 0) continue;
      rows.push({
        fieldId: seed.id,
        fieldName: titleCaseName(seed.name),
        month: point.month,
        sharePct: share,
        oeSm3: (point.oeSm3 * share) / 100,
      });
    }
  }
  return rows;
}

const companyCache = new Map<string, FieldMonthly[]>();
function companyHistory(groupId: string): FieldMonthly[] {
  const cached = companyCache.get(groupId);
  if (cached) return cached;
  const byMonth = new Map<string, FieldMonthly>();
  for (const seed of SEED_FIELDS) {
    const periods = ownershipOf(seed);
    if (!periods.some((p) => p.groupId === groupId)) continue;
    for (const point of fieldHistory(seed)) {
      const f = effectiveSharePct(periods, groupId, point.month) / 100;
      if (f <= 0) continue;
      const acc = byMonth.get(point.month) ?? {
        month: point.month,
        daysInMonth: point.daysInMonth,
        oilSm3: 0,
        gasOeSm3: 0,
        nglCondSm3: 0,
        oeSm3: 0,
        gasSm3: 0,
      };
      acc.oilSm3 += point.oilSm3 * f;
      acc.gasOeSm3 += point.gasOeSm3 * f;
      acc.nglCondSm3 += point.nglCondSm3 * f;
      acc.oeSm3 += point.oeSm3 * f;
      acc.gasSm3 += point.gasSm3 * f;
      byMonth.set(point.month, acc);
    }
  }
  const history = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  companyCache.set(groupId, history);
  return history;
}

function allGroupIds(): string[] {
  const ids = new Set<string>();
  for (const seed of SEED_FIELDS) for (const [g] of seed.owners) ids.add(g);
  return [...ids];
}

function toCompany(groupId: string): Company {
  const history = companyHistory(groupId);
  return {
    id: groupId,
    name: groupName(groupId),
    isFocus: FOCUS_IDS.includes(groupId),
    scopeNote: SCOPE_NOTES[groupId] ?? null,
    producingFieldCount: SEED_FIELDS.filter((s) => s.owners.some(([g]) => g === groupId)).length,
    latest: latestOf(history),
  };
}

const REPORT_LAG_DAYS: Record<string, number> = { 'var-energi': 12, 'aker-bp': 14 };

function quarters(groupId: string): ReportedQuarter[] {
  const history = companyHistory(groupId);
  const byQuarter = new Map<string, FieldMonthly[]>();
  for (const point of history) {
    const q = quarterOf(point.month).start;
    byQuarter.set(q, [...(byQuarter.get(q) ?? []), point]);
  }
  const rand = seededRandom(`quarters-${groupId}`);
  const lag = REPORT_LAG_DAYS[groupId];
  const recent = [...byQuarter.keys()].sort().slice(-2);
  return [...byQuarter.entries()]
    .filter(([q]) => q >= '2020-01-01')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarterStart, points]) => {
      const days = points.reduce((s, p) => s + p.daysInMonth, 0);
      const oe = points.reduce((s, p) => s + p.oeSm3, 0);
      const attributed = Math.round(sm3ToKboed(oe, days) * 10) / 10;
      const reported =
        lag !== undefined && recent.includes(quarterStart)
          ? Math.round(attributed * (1 + (rand() - 0.3) * 0.03) * 10) / 10
          : null;
      return {
        quarterStart,
        monthsInData: points.length,
        isComplete: points.length === 3,
        attributedKboed: attributed,
        reportedKboed: reported,
        errorPct: reported ? Math.round(((attributed - reported) / reported) * 10_000) / 100 : null,
        reportedOn:
          reported && lag !== undefined ? addDays(quarterOf(quarterStart).end, lag) : null,
        sourceUrl: null,
      };
    });
}

/** A hexagon around the centroid with the field's area: enough to draw an outline. */
function hexagon(seed: SeedField): number[][][] {
  const radiusKm = Math.sqrt(seed.areaKm2 / Math.PI);
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((seed.lat * Math.PI) / 180));
  const ring = Array.from({ length: 7 }, (_, i) => {
    const a = ((i % 6) / 6) * Math.PI * 2;
    return [seed.lon + Math.cos(a) * dLon, seed.lat + Math.sin(a) * dLat];
  });
  return [ring];
}

// Async so a thrown ApiError (unknown id) becomes a rejected promise, like a real 404.
export const mockCore: CoreApi = {
  freshness: async () => ({
    latestMonth: MOCK_LATEST_MONTH,
    lastRefreshAt: '2026-11-08T06:00:00Z',
    source: 'Sodir',
    licence: 'Norwegian Licence for Open Government Data (NLOD)',
    recentPublicationLags: [0, 1, 2].map((i) => ({
      month: addMonths(MOCK_LATEST_MONTH, -i),
      lagDaysMin: null,
      lagDaysMax: 68 + i * 31,
      isMeasured: false,
    })),
  }),
  companies: async (params) => {
    const ids = params?.focus ? FOCUS_IDS : allGroupIds();
    const list = ids
      .map(toCompany)
      .sort((a, b) => (b.latest?.boePerDay ?? 0) - (a.latest?.boePerDay ?? 0));
    return params?.limit ? list.slice(0, params.limit) : list;
  },
  company: async (id) => {
    if (!allGroupIds().includes(id)) throw new ApiError(404, `/companies/${id}`);
    return {
      ...toCompany(id),
      legalEntities: (LEGAL_ENTITIES[id] ?? [groupName(id)]).map((name) => ({
        companyId: companyNumber(name),
        name,
        nationCode: 'NO',
        factpageUrl: null,
      })),
    } satisfies CompanyDetail;
  },
  companyProduction: async (id, range) => companyHistory(id).filter((p) => inRange(p.month, range)),
  companyFields: async (id, range) => companyFieldRows(id).filter((r) => inRange(r.month, range)),
  companyQuarters: async (id, since) =>
    quarters(id).filter((q) => !since || q.quarterStart >= since),
  fields: async (params) =>
    SEED_FIELDS.filter((s) => !params?.status || s.status === params.status)
      .filter((s) => !params?.owner || s.owners.some(([g]) => g === params.owner))
      .map(toSummary)
      .sort((a, b) => (b.latest?.boePerDay ?? 0) - (a.latest?.boePerDay ?? 0)),
  field: async (id) => {
    const seed = findSeed(id);
    return {
      ...toSummary(seed),
      discoveryYear: seed.discoveryYear,
      areaKm2: seed.areaKm2,
      firstProductionMonth: seed.firstProductionMonth,
      lastProductionMonth: MOCK_LATEST_MONTH,
      factpageUrl: `https://factpages.sodir.no/field/pageview/all/${seed.id}`,
      currentOwners: seed.owners.map(([groupId, sharePct]) => ({
        companyId: companyNumber(groupId),
        companyName: groupName(groupId),
        groupId,
        groupName: groupName(groupId),
        sharePct,
      })),
    } satisfies FieldDetail;
  },
  fieldProduction: async (id, range) =>
    fieldHistory(findSeed(id)).filter((p) => inRange(p.month, range)),
  fieldOwnership: async (id) => ownershipOf(findSeed(id)),
  fieldOutlines: async () =>
    ({
      type: 'FeatureCollection',
      features: SEED_FIELDS.map((seed) => {
        const latest = latestOf(fieldHistory(seed));
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: hexagon(seed) },
          properties: {
            id: seed.id,
            name: titleCaseName(seed.name),
            status: seed.status,
            operatorId: seed.operatorId,
            boePerDay: latest?.boePerDay ?? null,
            oilShare: latest?.mix.oil ?? null,
          },
        };
      }),
    }) satisfies FieldOutlines,
};
