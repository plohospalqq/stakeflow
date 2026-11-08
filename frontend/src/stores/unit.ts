import { create } from 'zustand';
import { isUnit, type Unit } from '@/lib/units';

export const UNIT_PARAM = 'u';
export const DEFAULT_UNIT: Unit = 'boe';

/** The URL wins on first load, so a shared link opens in the sender's unit. */
function unitFromLocation(): Unit {
  const fromUrl = new URLSearchParams(window.location.search).get(UNIT_PARAM);
  return isUnit(fromUrl) ? fromUrl : DEFAULT_UNIT;
}

interface UnitState {
  unit: Unit;
  setUnit: (unit: Unit) => void;
}

export const useUnitStore = create<UnitState>((set) => ({
  unit: unitFromLocation(),
  setUnit: (unit) => set({ unit }),
}));
