import 'maplibre-gl/dist/maplibre-gl.css';
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
import { useChartTheme } from '@/hooks/useChartTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
}

const LABELLED_FIELDS = 9;
const NO_OUTLINES: FieldOutlines = { type: 'FeatureCollection', features: [] };
const INTERACTIVE = ['field-circles', 'field-fill'];

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

export function FieldMapCanvas({
  points,
  outlines,
  highlight,
  selectedId,
  onSelect,
  flyTo,
  height,
  cooperative,
}: FieldMapCanvasProps) {
  const t = useChartTheme();
  const map = useRef<MapRef>(null);
  const [hovering, setHovering] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    if (!flyTo || !map.current) return;
    const zoom = Math.max(map.current.getZoom(), 6);
    const center: [number, number] = [flyTo.lon, flyTo.lat];
    const options = { center, zoom };
    if (reduceMotion) map.current.jumpTo(options);
    else map.current.flyTo({ ...options, duration: 900 });
  }, [flyTo, reduceMotion]);

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
  const threshold = useMemo(
    () =>
      labelThreshold(
        points.map((p) => p.kboed),
        LABELLED_FIELDS,
      ),
    [points],
  );

  const dim = (on: number, off: number) => byOwnership(highlight, on, off);

  const outlineFill: LayerProps = {
    id: 'field-fill',
    type: 'fill',
    paint: {
      'fill-color': t.forecast,
      'fill-opacity': dim(t.theme === 'dark' ? 0.07 : 0.05, 0.015),
    },
  };
  const outlineLine: LayerProps = {
    id: 'field-outline',
    type: 'line',
    paint: {
      'line-color': t.muted,
      'line-width': 0.8,
      'line-opacity': dim(0.55, 0.12),
    },
  };
  const circles: LayerProps = {
    id: 'field-circles',
    type: 'circle',
    // Big fields first so small ones stay on top and clickable.
    layout: { 'circle-sort-key': ['-', 0, ['get', 'kboed']] },
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        radiusAt(1, MIN_RADIUS),
        9,
        radiusAt(2.2, MIN_RADIUS + 2),
      ],
      'circle-color': ['interpolate-lab', ['linear'], ['get', 'oilShare'], 0, t.gas, 1, t.oil],
      'circle-opacity': dim(0.88, 0.12),
      'circle-stroke-color': t.surface,
      'circle-stroke-width': 1,
      'circle-stroke-opacity': dim(0.9, 0.2),
    },
  };
  const selectedRing: LayerProps = {
    id: 'field-selected',
    type: 'circle',
    filter: ['==', ['get', 'id'], selectedId ?? -1],
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        ['+', 3, radiusAt(1, MIN_RADIUS)],
        9,
        ['+', 3, radiusAt(2.2, MIN_RADIUS + 2)],
      ],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': t.ink,
      'circle-stroke-width': 2,
    },
  };
  const labels: LayerProps = {
    id: 'field-labels',
    type: 'symbol',
    filter: ['any', ['>=', ['get', 'kboed'], threshold], ['==', ['get', 'id'], selectedId ?? -1]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [MAP_FONT],
      'text-size': 11.5,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': ['+', 0.6, ['/', radiusAt(1, MIN_RADIUS), 11.5]],
      'text-optional': true,
    },
    paint: {
      'text-color': t.ink,
      'text-halo-color': t.bg,
      'text-halo-width': 1.4,
      'text-opacity': dim(1, 0.35),
    },
  };

  const click = (e: MapLayerMouseEvent) => {
    const id = readId(e);
    if (id !== null) onSelect(id);
  };

  return (
    <Map
      ref={map}
      mapStyle={t.theme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light}
      initialViewState={{ bounds: NCS_BOUNDS, fitBoundsOptions: { padding: 16 } }}
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
    >
      <NavigationControl position="top-right" showCompass={false} />
      {/* Always mounted (empty until loaded) so the outlines stay below the circles. */}
      <Source id="outlines" type="geojson" data={outlines ?? NO_OUTLINES}>
        <Layer {...outlineFill} />
        <Layer {...outlineLine} />
      </Source>
      <Source id="fields" type="geojson" data={pointData}>
        <Layer {...circles} />
        <Layer {...selectedRing} />
        <Layer {...labels} />
      </Source>
    </Map>
  );
}
