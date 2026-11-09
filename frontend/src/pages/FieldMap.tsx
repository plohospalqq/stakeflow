import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  useField,
  useFieldOutlines,
  useFieldProduction,
  useFields,
  useFieldsOwnedBy,
  useSummary,
} from '@/api/hooks';
import { USE_MOCKS } from '@/api/mode';
import type { FieldDetail, FieldMonthly, FieldSummary } from '@/api/types';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { MapSidePanel, type MapPanelField } from '@/components/MapSidePanel';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits, type Units } from '@/hooks/useUnits';
import type { Dict } from '@/i18n/types';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';
import { latestView } from '@/lib/latest';
import { productKind, productKindColor } from '@/lib/mix';
import { FieldList, type FieldListRow } from './map/FieldList';
import {
  FieldMapCanvas,
  type FlyTarget,
  type MapPadding,
  type MapPoint,
} from './map/FieldMapCanvas';
import { MapLegend } from './map/MapLegend';
import { ShelfTimeline } from './map/ShelfTimeline';

const NONE = 'none';

/** Desktop: room for the floating panels (left card, right legend + list, bottom timeline). */
const DESKTOP_PADDING: MapPadding = { top: 110, bottom: 190, left: 400, right: 360 };
const MOBILE_PADDING: MapPadding = { top: 16, bottom: 16, left: 16, right: 16 };

function panelField(
  f: FieldSummary,
  detail: FieldDetail | undefined,
  history: FieldMonthly[] | undefined,
  units: Units,
  m: Dict,
): MapPanelField {
  const view = f.latest ? latestView(f.latest, units.unit) : null;
  const kind = f.latest ? productKind(f.latest.mix) : null;
  const owners = detail
    ? [
        ...detail.currentOwners
          .reduce((acc, o) => {
            const prev = acc.get(o.groupId);
            acc.set(o.groupId, {
              groupId: o.groupId,
              name: o.groupName,
              sharePct: (prev?.sharePct ?? 0) + o.sharePct,
            });
            return acc;
          }, new Map<string, { groupId: string; name: string; sharePct: number }>())
          .values(),
      ].sort((a, b) => b.sharePct - a.sharePct)
    : undefined;
  return {
    id: f.id,
    name: f.name,
    status: f.status,
    mainArea: f.mainArea ?? '',
    operatorName: f.operator?.name ?? null,
    productKind: kind ? m.products.kind[kind] : (f.hcType ?? m.products.kind.none),
    productColor: kind ? productKindColor(kind) : null,
    discoveryYear: detail?.discoveryYear,
    areaKm2: detail?.areaKm2,
    latest: view,
    history: history?.map((h) => ({
      month: h.month,
      oil: units.fromMonth(h.oilSm3, h.month),
      gas: units.fromMonth(h.gasOeSm3, h.month),
      nglCond: units.fromMonth(h.nglCondSm3, h.month),
    })),
    owners,
  };
}

/** ?field= keeps the selection in the URL so a map view can be shared. */
function useSelectedField(): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('field'));
  const selected = Number.isFinite(raw) && raw > 0 ? raw : null;
  const set = useCallback(
    (id: number | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === null) next.delete('field');
          else next.set('field', String(id));
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );
  return [selected, set];
}

/**
 * The Atlas: the shelf as a night sky of glowing fields over a real basemap, with glass
 * panels floating on it. On phones the panels stack under the map and the field card
 * becomes a bottom sheet.
 */
export default function FieldMap() {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const isDesktop = useIsDesktop();
  const fields = useFields();
  const outlines = useFieldOutlines();
  const summary = useSummary();
  const [owner, setOwner] = useState<string>(NONE);
  const owned = useFieldsOwnedBy(owner === NONE ? null : owner);
  const [selectedId, setSelectedId] = useSelectedField();
  const [query, setQuery] = useState('');
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${m.map.title} · Stakeflow`;
  }, [m]);

  const selectedSummary = fields.data?.find((f) => f.id === selectedId);
  const detail = useField(selectedSummary ? selectedSummary.id : NaN);
  const history = useFieldProduction(selectedSummary ? selectedSummary.id : NaN);

  const ownedIds = useMemo(
    () => (owner === NONE ? null : (owned.data ?? []).map((f) => f.id)),
    [owner, owned.data],
  );

  const points = useMemo<MapPoint[]>(
    () =>
      (fields.data ?? []).flatMap((f) =>
        f.lon !== null && f.lat !== null && f.latest && f.latest.boePerDay > 0
          ? [
              {
                id: f.id,
                name: f.name,
                lon: f.lon,
                lat: f.lat,
                kboed: f.latest.boePerDay / 1000,
                oilShare: f.latest.mix.oil,
              },
            ]
          : [],
      ),
    [fields.data],
  );

  const listRows = useMemo<FieldListRow[]>(() => {
    const q = query.trim().toLocaleLowerCase('nb-NO');
    const ownedSet = ownedIds ? new Set(ownedIds) : null;
    return (fields.data ?? [])
      .filter((f) => f.latest && f.latest.boePerDay > 0)
      .filter((f) => !ownedSet || ownedSet.has(f.id))
      .filter((f) => !q || f.name.toLocaleLowerCase('nb-NO').includes(q))
      .map((f) => ({
        id: f.id,
        name: f.name,
        operatorName: f.operator?.name ?? null,
        value: f.latest ? latestView(f.latest, units.unit).value : 0,
        oilShare: f.latest?.mix.oil ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [fields.data, ownedIds, query, units.unit]);

  // A shared link (?field=) opens centred on its field, once.
  const flewToLinked = useRef(false);
  useEffect(() => {
    if (flewToLinked.current || !selectedSummary) return;
    flewToLinked.current = true;
    if (selectedSummary.lon !== null && selectedSummary.lat !== null) {
      setFlyTo({ lon: selectedSummary.lon, lat: selectedSummary.lat, key: 0 });
    }
  }, [selectedSummary]);

  const select = useCallback(
    (id: number, from: HTMLElement | null, fly: boolean) => {
      opener.current = from;
      setSelectedId(id);
      const f = fields.data?.find((x) => x.id === id);
      if (fly && f && f.lon !== null && f.lat !== null) {
        setFlyTo({ lon: f.lon, lat: f.lat, key: Date.now() });
      }
    },
    [fields.data, setSelectedId],
  );

  const close = useCallback(() => {
    setSelectedId(null);
    // Back to whatever opened the panel: the list row, or the map for a click on a circle.
    const target =
      opener.current && document.contains(opener.current)
        ? opener.current
        : (mapBox.current?.querySelector<HTMLElement>('canvas') ?? searchBox.current);
    window.setTimeout(() => target?.focus(), 0);
  }, [setSelectedId]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const first = listRows[0];
    if (first) select(first.id, searchBox.current, true);
  };

  const ownerName = owner === NONE ? null : name(owner);
  const count = plural(m.common.fields, listRows.length);
  const summaryText = ownerName
    ? owned.isPending
      ? t(m.map.summaryOwnerLoading, { owner: ownerName })
      : t(m.map.summaryOwner, { fields: count, owner: ownerName })
    : query
      ? t(m.map.summaryQuery, { fields: count, q: query.trim() })
      : t(m.map.summaryAll, { fields: count });

  const panel = selectedSummary
    ? panelField(selectedSummary, detail.data, history.data, units, m)
    : null;
  const ownerOptions = [
    { value: NONE, label: m.map.allFields },
    ...FOCUS_ORDER.map((id) => ({ value: id, label: name(id) })),
  ];

  if (fields.isError) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto w-[min(1320px,calc(100%-32px))] py-10">
        <h1 className="display m-0 mb-4 text-h1 font-bold">{m.map.title}</h1>
        <ErrorState message={m.fields.loadFailed} onRetry={() => void fields.refetch()} />
      </main>
    );
  }

  const controls = (
    <>
      <form role="search" onSubmit={onSearch} className="w-full min-w-0 sm:w-[260px]">
        <label className="flex min-h-[40px] w-full items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--tx)_8%,transparent)] px-3.5 text-muted max-nav:min-h-[44px]">
          <Icon name="search" />
          <span className="sr-only">{m.map.find}</span>
          <input
            ref={searchBox}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.map.findPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
          />
        </label>
      </form>
      <SegmentedControl
        size="sm"
        label={m.map.highlightGroup}
        value={owner}
        onChange={setOwner}
        options={ownerOptions}
      />
    </>
  );

  const list = (
    <FieldList
      rows={listRows}
      loading={fields.isPending || (owner !== NONE && owned.isPending)}
      selectedId={selectedId}
      onSelect={(id, el) => select(id, el, true)}
      format={(v) => units.format(v)}
      unitLabel={units.label}
      summary={summaryText}
      className="min-h-0 flex-1"
    />
  );

  const canvas = (
    <div ref={mapBox} className="h-full w-full bg-[#03060c] [.t-light_&]:bg-[#d9e4ee]">
      <FieldMapCanvas
        points={points}
        outlines={outlines.data}
        highlight={ownedIds}
        selectedId={selectedId}
        onSelect={(id) =>
          select(id, mapBox.current?.querySelector<HTMLElement>('canvas') ?? null, false)
        }
        flyTo={flyTo}
        height="100%"
        cooperative={!isDesktop}
        padding={isDesktop ? DESKTOP_PADDING : MOBILE_PADDING}
      />
    </div>
  );

  const srIntro = (
    <>
      <h1 className="sr-only">{m.map.title}</h1>
      <p className="sr-only">{m.map.mapSr}</p>
    </>
  );
  const sourceNote = USE_MOCKS ? m.map.sampleOutlines : m.map.outlines;

  if (isDesktop) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="relative -mt-[68px] h-[100vh] min-h-[680px] overflow-hidden outline-none"
        // Basemap labels show through standard glass; the map's panels use the denser one.
        style={{ '--glass': 'var(--glass-strong)' }}
      >
        {srIntro}
        <div className="absolute inset-0">{canvas}</div>

        <div className="glass enter absolute left-4 top-[84px] flex max-w-[calc(100%-32px)] flex-wrap items-center gap-2.5 rounded-full py-1.5 pl-5 pr-2">
          <span className="display text-[17px] font-semibold tracking-[-0.02em]" aria-hidden="true">
            {m.map.title}
          </span>
          {controls}
        </div>

        <div
          className="enter absolute left-4 top-[148px] flex max-h-[calc(100%-148px-200px)] w-[360px] flex-col overflow-y-auto"
          style={{ '--i': 2 }}
        >
          <MapSidePanel
            field={panel}
            focusCompanies={owner === NONE ? FOCUS_ORDER : [owner]}
            onClose={close}
            unitLabel={units.label}
            format={(v) => units.format(v)}
            detailHref={(id) => `/fields/${id}`}
          />
        </div>

        <div
          className="glass enter absolute right-4 top-[148px] flex max-h-[calc(100%-148px-200px)] w-[320px] flex-col gap-4 rounded-[24px] p-4"
          style={{ '--i': 3 }}
        >
          <MapLegend />
          <span className="lbl -mt-2 text-[11.5px]">{sourceNote}</span>
          <div className="flex min-h-0 flex-1 flex-col border-t border-line pt-3">{list}</div>
        </div>

        <div className="absolute inset-x-4 bottom-8 flex justify-center">
          <ShelfTimeline series={summary.data?.series} className="enter w-[min(980px,100%)]" />
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-[min(1320px,calc(100%-32px))] flex-col gap-4 pb-10 pt-6 outline-none"
    >
      {srIntro}
      <div className="flex flex-col gap-1">
        <span className="text-[14px] font-semibold text-muted">{m.map.label}</span>
        <span
          className="display text-[30px] font-bold leading-[1.1] tracking-[-0.035em]"
          aria-hidden="true"
        >
          {m.map.title}
        </span>
        <span className="text-[15px] text-muted">{m.map.lede}</span>
      </div>
      <div className="flex flex-col gap-3">{controls}</div>
      <div className="relative h-[min(62vh,520px)] overflow-hidden rounded-[24px]">{canvas}</div>
      <ShelfTimeline series={summary.data?.series} />
      <div className="card flex flex-col gap-3 p-4">
        <MapLegend />
        <span className="lbl text-[11.5px]">{sourceNote}</span>
      </div>
      <div className="card flex max-h-[520px] flex-col p-3">{list}</div>
      <MapSidePanel
        field={panel}
        focusCompanies={owner === NONE ? FOCUS_ORDER : [owner]}
        onClose={close}
        unitLabel={units.label}
        format={(v) => units.format(v)}
        detailHref={(id) => `/fields/${id}`}
        className={
          panel
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[78vh] overflow-y-auto rounded-b-none bg-[var(--glass-strong)]'
            : undefined
        }
      />
    </main>
  );
}
