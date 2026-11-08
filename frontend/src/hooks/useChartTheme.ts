import { useMemo } from 'react';
import { useThemeStore, type Theme } from '@/stores/theme';

export interface ChartTheme {
  theme: Theme;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  ink: string;
  muted: string;
  faint: string;
  oil: string;
  gas: string;
  cond: string;
  up: string;
  down: string;
  warn: string;
  forecast: string;
  /** Neutral ramp for fields in stacked company charts, light to dark (dark theme). */
  fields: string[];
  sans: string;
  mono: string;
}

const TOKEN_NAMES = {
  bg: 'bg',
  surface: 'sf',
  surface2: 'sf2',
  surface3: 'sf3',
  line: 'bd',
  lineStrong: 'bd2',
  ink: 'tx',
  muted: 'mu',
  faint: 'fa',
  oil: 'oil',
  gas: 'gas',
  cond: 'cnd',
  up: 'up',
  down: 'dn',
  warn: 'warn',
  forecast: 'fc',
} as const;

type TokenKey = keyof typeof TOKEN_NAMES;

/** Same values as index.css; used only where computed styles are empty (tests, SSR). */
const FALLBACK: Record<Theme, Record<TokenKey, string> & { fields: string[] }> = {
  dark: {
    bg: '#0A0C0F',
    surface: '#111419',
    surface2: '#171B21',
    surface3: '#1F242C',
    line: '#232932',
    lineStrong: '#2F3641',
    ink: '#E7E9EC',
    muted: '#9AA3B0',
    faint: '#5F6875',
    oil: '#E8A33D',
    gas: '#4A95E6',
    cond: '#B8A2F4',
    up: '#5CBF93',
    down: '#EE7B71',
    warn: '#E5B54A',
    forecast: '#D5DAE1',
    fields: ['#E3E8EE', '#B9C3CF', '#93A0B0', '#707D8F', '#535E6E', '#3B4451'],
  },
  light: {
    bg: '#F5F6F8',
    surface: '#FFFFFF',
    surface2: '#F0F2F5',
    surface3: '#E6E9EE',
    line: '#E0E4EA',
    lineStrong: '#CBD2DB',
    ink: '#13161B',
    muted: '#566070',
    faint: '#A0A8B3',
    oil: '#B4690C',
    gas: '#1F6BC1',
    cond: '#7255D2',
    up: '#1B7E54',
    down: '#C0443A',
    warn: '#946500',
    forecast: '#2E3540',
    fields: ['#1F2630', '#3D4756', '#5D697A', '#7F8B9B', '#A3ADBA', '#C6CDD6'],
  },
};

function readTheme(theme: Theme): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const fallback = FALLBACK[theme];
  const read = (cssName: string, fb: string) =>
    styles.getPropertyValue(`--${cssName}`).trim() || fb;
  const pick = (key: TokenKey) => read(TOKEN_NAMES[key], fallback[key]);
  return {
    theme,
    bg: pick('bg'),
    surface: pick('surface'),
    surface2: pick('surface2'),
    surface3: pick('surface3'),
    line: pick('line'),
    lineStrong: pick('lineStrong'),
    ink: pick('ink'),
    muted: pick('muted'),
    faint: pick('faint'),
    oil: pick('oil'),
    gas: pick('gas'),
    cond: pick('cond'),
    up: pick('up'),
    down: pick('down'),
    warn: pick('warn'),
    forecast: pick('forecast'),
    fields: fallback.fields.map((fb, i) => read(`f${i + 1}`, fb)),
    sans: '"Inter Variable", Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
  };
}

/**
 * Chart colours read from the CSS variables at runtime, so ECharts (which draws on a
 * canvas and cannot use var(--x)) follows the same tokens as the rest of the UI.
 * Re-computed whenever the theme changes; the theme class is applied before the store
 * updates, so the computed styles are already current here.
 */
export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  return useMemo(() => readTheme(theme), [theme]);
}
