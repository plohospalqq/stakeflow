/**
 * The ready-made scenarios come from the backend (GET /scenarios/presets; the mock layer
 * mirrors them). The UI keeps only their order and its own words for the ids it knows; an id
 * it does not know is still shown, with the backend's English name.
 */
import type { ScenarioPreset } from '@/api/types.scenario';
import type { Dict } from '@/i18n/types';
import { NEUTRAL_SCENARIO } from '@/lib/scenario';

export const PRESET_ORDER = [
  'oil-crash',
  'gas-spike',
  'oil-rally',
  'strong-dollar',
  'sverdrup-outage',
  'calm-year',
] as const;

export type KnownPresetId = (typeof PRESET_ORDER)[number];

export function isKnownPreset(id: string): id is KnownPresetId {
  return PRESET_ORDER.some((known) => known === id);
}

/** Known presets in display order, unknown ones after them in the backend's order. */
export function orderPresets(presets: ScenarioPreset[]): ScenarioPreset[] {
  const rank = (id: string) => {
    const i = PRESET_ORDER.findIndex((known) => known === id);
    return i === -1 ? PRESET_ORDER.length : i;
  };
  return [...presets].sort((a, b) => rank(a.id) - rank(b.id));
}

/** The reader's words for a known preset; the backend's English for one the UI does not know. */
export function presetWords(
  m: Dict,
  preset: ScenarioPreset,
): { label: string; text: string; lang?: 'en' } {
  if (isKnownPreset(preset.id)) return m.scenarios.presetsById[preset.id];
  return { label: preset.name, text: preset.description, lang: 'en' };
}

/** The explorer opens on "Oil −30%": a blank 0% says nothing about what it does. */
export const DEFAULT_PRESET: KnownPresetId = 'oil-crash';
export const DEFAULT_PARAMS = { ...NEUTRAL_SCENARIO, brentChangePct: -30, horizonMonths: 3 };

export const SCENARIO_COMPANIES = ['aker-bp', 'var-energi', 'equinor'];
