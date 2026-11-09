import { create } from 'zustand';
import type { Mode } from '@/i18n/text';
import { readStorage, writeStorage } from '@/lib/storage';

export const MODE_STORAGE_KEY = 'stakeflow-mode';

function isMode(value: unknown): value is Mode {
  return value === 'simple' || value === 'expert';
}

/** First-time visitors get "Simple words"; anyone who picked Expert keeps it. */
export function initialMode(): Mode {
  const saved = readStorage(MODE_STORAGE_KEY);
  return isMode(saved) ? saved : 'simple';
}

interface ModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: initialMode(),
  setMode: (mode) => {
    writeStorage(MODE_STORAGE_KEY, mode);
    set({ mode });
  },
}));
