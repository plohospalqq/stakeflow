/**
 * Basemap labels in the app language. The OpenFreeMap styles print the Latin name with the
 * local-script name under it, whatever the reader speaks, so the Barents Sea and Russian towns
 * came out in Cyrillic in every language. The tiles carry a name per language (OpenMapTiles
 * schema: 'name:en', 'name:uk', 'name:no' …), so the labels can ask for the right one.
 */
import type { Lang } from '@/i18n/types';

/** OpenMapTiles files Norwegian under 'no'; it has no 'name:nb'. */
const TILE_LANGUAGE: Record<Lang, string> = { en: 'en', uk: 'uk', nb: 'no' };

type Get = ['get', string];
export type NameExpression = ['coalesce', Get, Get];

/**
 * The name in the app language, else any Latin name. Deliberately no fallback to 'name' (the
 * local script) or 'name_en' (which falls back to it): a place with neither gets no label
 * rather than one the reader cannot read.
 */
export function basemapNameExpression(lang: Lang): NameExpression {
  return ['coalesce', ['get', `name:${TILE_LANGUAGE[lang]}`], ['get', 'name:latin']];
}

const NAME_KEY = /^name\b/;
const NAME_TOKEN = /\{name\b/;

/** True when a text-field reads a name property: as an expression or the older '{name}' form. */
export function usesName(textField: unknown): boolean {
  if (typeof textField === 'string') return NAME_TOKEN.test(textField);
  if (!Array.isArray(textField)) return false;
  const parts: unknown[] = textField;
  const [operator, key] = parts;
  if (operator === 'get' && typeof key === 'string') return NAME_KEY.test(key);
  return parts.some(usesName);
}

/**
 * Water names come from the app: it labels the three seas of the shelf itself, translated and
 * in its own style. The light basemap prints its own name right under ours ("NORTH SEA" over
 * "North Sea"), so its water labels are switched off, as the dark style already leaves them out
 * at these zooms.
 */
const WATER_NAMES = 'water_name';

/** The part of a MapLibre map the labels need; small enough to fake in a test. */
export interface LabelMap {
  getLayersOrder(): string[];
  getLayer(id: string): { type: string; sourceLayer?: string } | undefined;
  getLayoutProperty(layerId: string, name: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
}

/**
 * Points every basemap name label at the app language and hides the basemap's water names.
 * Road numbers ('ref') stay as they are, and so do our own GeoJSON layers (no source layer),
 * whose names come from the dictionaries. Safe to call on every style event: MapLibre ignores
 * a value that did not change.
 */
export function localiseBasemapLabels(map: LabelMap, lang: Lang): void {
  const name = basemapNameExpression(lang);
  for (const id of map.getLayersOrder()) {
    const layer = map.getLayer(id);
    if (layer?.type !== 'symbol' || !layer.sourceLayer) continue;
    if (layer.sourceLayer === WATER_NAMES) {
      map.setLayoutProperty(id, 'visibility', 'none');
    } else if (usesName(map.getLayoutProperty(id, 'text-field'))) {
      map.setLayoutProperty(id, 'text-field', name);
    }
  }
}
