import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  useField,
  useFieldOutlines,
  useFieldProduction,
  useFields,
  useFieldsOwnedBy,
} from '@/api/hooks';
import { USE_MOCKS } from '@/api/mode';
import type { FieldDetail, FieldMonthly, FieldSummary } from '@/api/types';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { Page } from '@/components/layout/Page';
import { MapSidePanel, type MapPanelField } from '@/components/MapSidePanel';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits, type Units } from '@/hooks/useUnits';
import { COMPANY_META, FOCUS_ORDER } from '@/lib/companies';
import { latestView } from '@/lib/latest';
import { productKind } from '@/lib/mix';
import { FieldList, type FieldListRow } from './map/FieldList';
import { FieldMapCanvas, type FlyTarget, type MapPoint } from './map/FieldMapCanvas';
import { MapLegend } from './map/MapLegend';

const NONE = 'none';

const OWNER_OPTIONS = [
  { value: NONE, label: 'All fields' },
  ...FOCUS_ORDER.map((id) => ({ value: id, label: COMPANY_META[id]?.name ?? id })),
];

function panelField(
  f: FieldSummary,
  detail: FieldDetail | undefined,
  history: FieldMonthly[] | undefined,
  units: Units,
): MapPanelField {
  const view = f.latest ? latestView(f.latest, units.unit) : null;
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
    productKind: f.latest ? productKind(f.latest.mix) : (f.hcType ?? 'No recent output'),
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

export default function FieldMap() {
  const units = useUnits();
  const isDesktop = useIsDesktop();
  const fields = useFields();
  const outlines = useFieldOutlines();
  const [owner, setOwner] = useState<string>(NONE);
  const owned = useFieldsOwnedBy(owner === NONE ? null : owner);
  const [selectedId, setSelectedId] = useSelectedField();
  const [query, setQuery] = useState('');
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);

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

  const ownerName = owner === NONE ? null : (COMPANY_META[owner]?.name ?? owner);
  const summary = ownerName
    ? owned.isPending
      ? `Finding fields owned by ${ownerName}…`
      : `${listRows.length} producing fields with a share held by ${ownerName}`
    : `${listRows.length} producing fields${query ? ` matching “${query.trim()}”` : ''}, latest month`;

  const panel = selectedSummary
    ? panelField(selectedSummary, detail.data, history.data, units)
    : null;
  const sheet = Boolean(panel) && !isDesktop;
  const mapHeight = isDesktop ? 680 : 'min(62vh, 520px)';

  if (fields.isError) {
    return (
      <Page label="Field map" title="Where the production is">
        <ErrorState message="Fields could not be loaded." onRetry={() => void fields.refetch()} />
      </Page>
    );
  }

  return (
    <Page label="Field map" title="Where the production is">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="lbl" aria-hidden="true">
            Highlight owner
          </span>
          <SegmentedControl
            label="Highlight fields owned by"
            value={owner}
            onChange={setOwner}
            options={OWNER_OPTIONS}
          />
        </div>
        <form role="search" onSubmit={onSearch} className="w-full sm:w-[280px]">
          <label className="input flex w-full items-center gap-2 text-muted max-nav:min-h-[44px]">
            <Icon name="search" />
            <span className="sr-only">Find a field (Enter opens the first match)</span>
            <input
              ref={searchBox}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a field, e.g. Troll"
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none"
            />
          </label>
        </form>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-labelledby="map-h" className="card min-w-0 flex-[3_1_520px] overflow-hidden">
          <h2 id="map-h" className="sr-only">
            Map of fields
          </h2>
          <p className="sr-only">
            Circles mark producing fields, sized by production and coloured by oil share. The
            “Fields by production” list next to the map offers the same fields for keyboard and
            screen reader use.
          </p>
          <div ref={mapBox} className="bg-surface2">
            <FieldMapCanvas
              points={points}
              outlines={outlines.data}
              highlight={ownedIds}
              selectedId={selectedId}
              onSelect={(id) =>
                select(id, mapBox.current?.querySelector<HTMLElement>('canvas') ?? null, false)
              }
              flyTo={flyTo}
              height={mapHeight}
              cooperative={!isDesktop}
            />
          </div>
          {/* Below the map, not on it: an overlay would cover the North Sea fields. */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-line px-3 py-2.5">
            <MapLegend />
            <span className="lbl text-[11px]">
              {USE_MOCKS
                ? 'Sample data: hexagons stand in for field outlines'
                : 'Sodir field outlines and centroids · basemap OpenFreeMap'}
            </span>
          </div>
        </section>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 nav:max-w-[420px]">
          <MapSidePanel
            field={panel}
            focusCompanies={owner === NONE ? FOCUS_ORDER : [owner]}
            onClose={close}
            unitLabel={units.label}
            format={(v) => units.format(v)}
            detailHref={(id) => `/fields/${id}`}
            className={
              sheet
                ? 'fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-b-none shadow-[0_-12px_32px_rgba(0,0,0,0.35)]'
                : undefined
            }
          />
          <FieldList
            rows={listRows}
            loading={fields.isPending || (owner !== NONE && owned.isPending)}
            selectedId={selectedId}
            onSelect={(id, el) => select(id, el, true)}
            format={(v) => units.format(v)}
            unitLabel={units.label}
            summary={summary}
          />
        </div>
      </div>
    </Page>
  );
}
