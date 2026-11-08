import { create } from 'zustand';
import { readStorage, writeStorage } from '@/lib/storage';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'stakeflow-theme';

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** Saved choice first, then the OS preference; dark when neither says light. */
export function initialTheme(): Theme {
  const saved = readStorage(THEME_STORAGE_KEY);
  if (isTheme(saved)) return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('t-dark', 't-light');
  root.classList.add(`t-${theme}`);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    writeStorage(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
