import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapInstance } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Source,
  type CircleLayerSpecification,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { FieldOutlines } from '@/api/types';
import { useChartTheme, type ChartTheme } from '@/hooks/useChartTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import {
  MAP_FONT,
  MAP_STYLES,
  MIN_RADIUS,
  NCS_BOUNDS,
  RADIUS_PER_SQRT_KBOED,
  labelThreshold,
} from '@/lib/mapScale';

export interface MapPoint {
  id: number;
  name: string;
  lon: number;
  lat: number;
  kboed: number;
  oilShare: number;
}

export interface FlyTarget {
  lon: number;
  lat: number;
  /** Changes on every request, so flying to the same field twice still moves the map. */
  key: number;
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FieldMapCanvasProps {
  points: MapPoint[];
  outlines: FieldOutlines | undefined;
  /** Field ids to keep bright; null = no owner highlighted. */
  highlight: number[] | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  flyTo: FlyTarget | null;
  height: number | string;
  /** Touch: one finger scrolls the page, two move the map. */
  cooperative: boolean;
  /** Room taken by floating panels, so fields are framed in the visible part. */
  padding: MapPadding;
}

const LABELLED_FIELDS = 9;
const NO_OUTLINES: FieldOutlines = { type: 'FeatureCollection', features: [] };
const INTERACTIVE = ['field-core', 'field-fill'];

/** Where the three seas' names sit, roughly in the middle of each. */
const SEA_POINTS = [
  { key: 'north', lon: 3.2, lat: 57.4 },
  { key: 'norwegian', lon: 4.2, lat: 66.6 },
  { key: 'barents', lon: 25.5, lat: 73.4 },
] as const;

/**
 * MapLibre's expression type, taken from a public layer type because the style-spec
 * package that defines it is not a direct dependency. Functions returning it let the
 * array literals below be checked as real expressions, without casts.
 */
type Expression = Extract<
  NonNullable<CircleLayerSpecification['paint']>['circle-opacity'],
  unknown[]
>;

/** Radius in pixels: √production at the overview zoom, scaled up as you zoom in. */
function radiusAt(scale: number, min: number): Expression {
  return ['max', min, ['*', RADIUS_PER_SQRT_KBOED * scale, ['sqrt', ['get', 'kboed']]]];
}

function zoomRadius(extra: number, factor = 1): Expression {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    ['+', extra, ['*', factor, radiusAt(1, MIN_RADIUS)]],
    9,
    ['+', extra, ['*', factor, radiusAt(2.2, MIN_RADIUS + 2)]],
  ];
}

function ownedTest(highlight: number[] | null): Expression {
  return highlight ? ['in', ['get', 'id'], ['literal', highlight]] : ['boolean', true];
}

function byOwnership(highlight: number[] | null, on: number, off: number): Expression {
  return ['case', ownedTest(highlight), on, off];
}

function readId(e: MapLayerMouseEvent): number | null {
  const id: unknown = e.features?.[0]?.properties?.id;
  return typeof id === 'number' ? id : null;
}

/**
 * The OpenFreeMap styles reference sprite icons (e.g. "circle-11") their sprite does not ship.
 * A transparent stand-in keeps the console clean without changing the map. Hooked on the first
 * `styledata` event: after the map exists, before any symbol asks for an icon.
 */
const patchedMaps = new WeakSet<MapInstance>();
function fillMissingSprites(m: MapInstance): void {
  if (patchedMaps.has(m)) return;
  patchedMaps.add(m);
  m.on('styleimagemissing', ({ id }: { id: string }) => {
    if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}

/**
 * Night-sky basemap: the stock dark style has water lighter than land; here the sea goes
 * deep navy and the land a touch lighter, so coastlines frame the glowing fields. In light
 * mode the water gets a faint blue. Guarded: layers differ between styles.
 */
function tuneBasemap(m: MapInstance, theme: ChartTheme['theme']): void {
  const set = (layer: string, prop: string, value: string | number) => {
    if (m.getLayer(layer)) m.setPaintProperty(layer, prop, value);
  };
  if (theme === 'dark') {
    set('background', 'background-color', '#11141b');
    set('water', 'fill-color', '#03060c');
    set('landcover_ice_shelf', 'fill-color', '#11141b');
  } else {
    set('background', 'background-color', '#f5f5f7');
    set('water', 'fill-color', '#d9e4ee');
  }
}

export function FieldMapCanvas({
  points,
  outlines,
  highlight,
  selectedId,
  onSelect,
  flyTo,
  height,
  cooperative,
  padding,
}: FieldMapCanvasProps) {
  const t = useChartTheme();
  const { m } = useI18n();
  const map = useRef<MapRef>(null);
  const [hovering, setHovering] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = t.theme === 'dark';

  useEffect(() => {
    if (!flyTo || !map.current) return;
    const zoom = Math.max(map.current.getZoom(), 6);
    const center: [number, number] = [flyTo.lon, flyTo.lat];
    const options = { center, zoom, padding };
    if (reduceMotion) map.current.jumpTo(options);
    else map.current.flyTo({ ...options, duration: 900 });
    // padding is read when flying, not a reason to fly again.
  }, [flyTo, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: points.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { id: p.id, name: p.name, kboed: p.kboed, oilShare: p.oilShare },
      })),
    }),
    [points],
  );
  const seaData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: SEA_POINTS.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: { name: m.map.seas[s.key] },
      })),
    }),
    [m],
  );
  const threshold = useMemo(
    () =>
      labelThreshold(
        points.map((p) => p.kboed),
        LABELLED_FIELDS,
      ),
    [points],
  );

  const dim = (on: number, off: number) => byOwnership(highlight, on, off);
  const color: Expression = [
    'interpolate-lab',
    ['linear'],
    ['get', 'oilShare'],
    0,
    t.gas,
    1,
    t.oil,
  ];

  const outlineFill: LayerProps = {
    id: 'field-fill',
    type: 'fill',
    paint: {
      'fill-color': t.forecast,
      'fill-opacity': dim(dark ? 0.05 : 0.05, 0.01),
    },
  };
  const outlineLine: LayerProps = {
    id: 'field-outline',
    type: 'line',
    paint: {
      'line-color': t.muted,
      'line-width': 0.6,
      'line-opacity': dim(dark ? 0.35 : 0.5, 0.08),
    },
  };
  // Two layers make the glow: a wide blurred halo under a crisp core.
  const halo: LayerProps = {
    id: 'field-halo',
    type: 'circle',
    layout: { 'circle-sort-key': ['-', 0, ['get', 'kboed']] },
    paint: {
      'circle-radius': zoomRadius(2, 2.6),
      'circle-color': color,
      'circle-blur': 1,
      'circle-opacity': dim(dark ? 0.55 : 0.32, 0.04),
    },
  };
  const core: LayerProps = {
    id: 'field-core',
    type: 'circle',
    // Big fields first so small ones stay on top and clickable.
    layout: { 'circle-sort-key': ['-', 0, ['get', 'kboed']] },
    paint: {
      'circle-radius': zoomRadius(0),
      'circle-color': color,
      'circle-opacity': dim(0.95, 0.15),
      'circle-stroke-color': dark ? 'rgba(255,255,255,0.45)' : '#ffffff',
      'circle-stroke-width': dark ? 0.6 : 1,
      'circle-stroke-opacity': dim(1, 0.2),
    },
  };
  const selectedRing: LayerProps = {
    id: 'field-selected',
    type: 'circle',
    filter: ['==', ['get', 'id'], selectedId ?? -1],
    paint: {
      'circle-radius': zoomRadius(7),
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': t.ink,
      'circle-stroke-width': 1.6,
      'circle-stroke-opacity': 0.9,
    },
  };
  const labels: LayerProps = {
    id: 'field-labels',
    type: 'symbol',
    filter: ['any', ['>=', ['get', 'kboed'], threshold], ['==', ['get', 'id'], selectedId ?? -1]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [MAP_FONT],
      'text-size': 12,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': ['+', 0.7, ['/', radiusAt(1, MIN_RADIUS), 12]],
      'text-optional': true,
    },
    paint: {
      'text-color': t.ink,
      'text-halo-color': dark ? '#03060c' : '#ffffff',
      'text-halo-width': 1.4,
      'text-opacity': dim(0.92, 0.3),
    },
  };
  const seas: LayerProps = {
    id: 'sea-labels',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [MAP_FONT],
      'text-size': 11,
      'text-letter-spacing': 0.35,
      'text-transform': 'uppercase',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': dark ? 'rgba(235,235,245,0.3)' : 'rgba(29,29,31,0.35)',
    },
  };

  const click = (e: MapLayerMouseEvent) => {
    const id = readId(e);
    if (id !== null) onSelect(id);
  };

  return (
    <Map
      ref={map}
      mapStyle={dark ? MAP_STYLES.dark : MAP_STYLES.light}
      initialViewState={{ bounds: NCS_BOUNDS, fitBoundsOptions: { padding } }}
      style={{ width: '100%', height }}
      minZoom={3}
      maxZoom={11}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      cooperativeGestures={cooperative}
      attributionControl={{ compact: true }}
      interactiveLayerIds={INTERACTIVE}
      cursor={hovering ? 'pointer' : 'grab'}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={click}
      onStyleData={(e) => {
        fillMissingSprites(e.target);
        tuneBasemap(e.target, t.theme);
      }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <Source id="seas" type="geojson" data={seaData}>
        <Layer {...seas} />
      </Source>
      {/* Always mounted (empty until loaded) so the outlines stay below the circles. */}
      <Source id="outlines" type="geojson" data={outlines ?? NO_OUTLINES}>
        <Layer {...outlineFill} />
        <Layer {...outlineLine} />
      </Source>
      <Source id="fields" type="geojson" data={pointData}>
        <Layer {...halo} />
        <Layer {...core} />
        <Layer {...selectedRing} />
        <Layer {...labels} />
      </Source>
    </Map>
  );
}
