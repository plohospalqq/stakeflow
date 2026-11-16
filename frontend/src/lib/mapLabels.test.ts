import { describe, expect, it } from 'vitest';
import { LANGS } from '@/i18n/types';
import { basemapNameExpression, localiseBasemapLabels, usesName, type LabelMap } from './mapLabels';

/** What both OpenFreeMap styles ship for places and water: Latin over the local script. */
const STOCK_NAME = [
  'case',
  ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']],
];
const ROAD_REF = ['to-string', ['get', 'ref']];

interface FakeLayer {
  id: string;
  type: string;
  sourceLayer?: string;
  textField?: unknown;
}

/** The four methods the labels need, over a plain list of layers. */
function fakeMap(layers: FakeLayer[]): LabelMap & { writes: string[] } {
  const find = (id: string) => layers.find((l) => l.id === id);
  const writes: string[] = [];
  return {
    writes,
    getLayersOrder: () => layers.map((l) => l.id),
    getLayer: (id) => find(id),
    getLayoutProperty: (id, name) => (name === 'text-field' ? find(id)?.textField : undefined),
    setLayoutProperty: (id, name, value) => {
      const layer = find(id);
      if (!layer || name !== 'text-field') return;
      layer.textField = value;
      writes.push(id);
    },
  };
}

describe('basemapNameExpression', () => {
  it('asks for the app language first, then any Latin name', () => {
    expect(basemapNameExpression('uk')).toEqual([
      'coalesce',
      ['get', 'name:uk'],
      ['get', 'name:latin'],
    ]);
  });

  it('uses name:no for Norwegian: OpenMapTiles has no name:nb', () => {
    expect(basemapNameExpression('nb')).toEqual([
      'coalesce',
      ['get', 'name:no'],
      ['get', 'name:latin'],
    ]);
  });

  it('never falls back to the local-script name, in any language', () => {
    for (const lang of LANGS) {
      const [, ...gets] = basemapNameExpression(lang);
      const keys = gets.map(([, key]) => key);
      expect(keys).not.toContain('name');
      expect(keys).not.toContain('name:nonlatin');
    }
  });
});

describe('usesName', () => {
  it('finds name properties at any depth', () => {
    expect(usesName(STOCK_NAME)).toBe(true);
    expect(usesName(basemapNameExpression('en'))).toBe(true);
  });

  it('finds the older {token} form', () => {
    expect(usesName('{name:latin}\n{name:nonlatin}')).toBe(true);
  });

  it('leaves road numbers and layers without text alone', () => {
    expect(usesName(ROAD_REF)).toBe(false);
    expect(usesName('{ref}')).toBe(false);
    expect(usesName(undefined)).toBe(false);
  });
});

describe('localiseBasemapLabels', () => {
  const layers = (): FakeLayer[] => [
    { id: 'water', type: 'fill', sourceLayer: 'water' },
    { id: 'water_name', type: 'symbol', sourceLayer: 'water_name', textField: STOCK_NAME },
    { id: 'place_city', type: 'symbol', sourceLayer: 'place', textField: STOCK_NAME },
    {
      id: 'highway_name_motorway',
      type: 'symbol',
      sourceLayer: 'transportation_name',
      textField: ROAD_REF,
    },
    // Ours: a GeoJSON layer has no source layer, and its names are already translated.
    { id: 'sea-labels', type: 'symbol', textField: ['get', 'name'] },
  ];

  it('rewrites the basemap name labels and nothing else', () => {
    const map = fakeMap(layers());
    localiseBasemapLabels(map, 'nb');
    expect(map.writes).toEqual(['water_name', 'place_city']);
    expect(map.getLayoutProperty('place_city', 'text-field')).toEqual(basemapNameExpression('nb'));
    expect(map.getLayoutProperty('highway_name_motorway', 'text-field')).toEqual(ROAD_REF);
    expect(map.getLayoutProperty('sea-labels', 'text-field')).toEqual(['get', 'name']);
  });

  it('follows a language switch on labels it already rewrote', () => {
    const map = fakeMap(layers());
    localiseBasemapLabels(map, 'en');
    localiseBasemapLabels(map, 'uk');
    expect(map.getLayoutProperty('water_name', 'text-field')).toEqual(basemapNameExpression('uk'));
  });
});
