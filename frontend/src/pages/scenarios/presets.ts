import type { ScenarioParams } from '@/api/types.scenario';
import { NEUTRAL_SCENARIO } from '@/lib/scenario';

export type PresetId = 'oilDown' | 'gasUp' | 'oilUp' | 'dollar' | 'sverdrup' | 'calm';

export interface Preset {
  id: PresetId;
  label:
    | 'presetOilDown'
    | 'presetGasUp'
    | 'presetOilUp'
    | 'presetDollar'
    | 'presetSverdrup'
    | 'presetCalm';
  /** Sverdrup's needs the company's real share of output, so presets are functions. */
  params: (sverdrupShare: number) => ScenarioParams;
}

const base = NEUTRAL_SCENARIO;

/** Johan Sverdrup stopping for two of the six months: its share × 2/6 of output is lost. */
export function sverdrupCutPct(share: number): number {
  return -Math.round(share * (2 / 6) * 1000) / 10;
}

export const PRESETS: Preset[] = [
  { id: 'oilDown', label: 'presetOilDown', params: () => ({ ...base, brentChangePct: -30 }) },
  { id: 'gasUp', label: 'presetGasUp', params: () => ({ ...base, ttfChangePct: 50 }) },
  { id: 'oilUp', label: 'presetOilUp', params: () => ({ ...base, brentChangePct: 20 }) },
  { id: 'dollar', label: 'presetDollar', params: () => ({ ...base, eurusdChangePct: 10 }) },
  {
    id: 'sverdrup',
    label: 'presetSverdrup',
    params: (share) => ({ ...base, productionChangePct: sverdrupCutPct(share) }),
  },
  { id: 'calm', label: 'presetCalm', params: () => ({ ...base }) },
];

export function isPresetId(value: unknown): value is PresetId {
  return PRESETS.some((p) => p.id === value);
}

export const SCENARIO_COMPANIES = ['aker-bp', 'var-energi', 'equinor'];
