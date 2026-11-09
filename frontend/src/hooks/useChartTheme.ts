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
  /** Display face for big chart numbers. */
  display: string;
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
    bg: '#000000',
    surface: '#141416',
    surface2: '#1C1C1F',
    surface3: '#2A2A2E',
    line: 'rgba(255, 255, 255, 0.1)',
    lineStrong: 'rgba(255, 255, 255, 0.18)',
    ink: '#F5F5F7',
    muted: '#A1A1A6',
    faint: '#6E6E73',
    oil: '#FF9F0A',
    gas: '#64D2FF',
    cond: '#BF5AF2',
    up: '#30D158',
    down: '#FF453A',
    warn: '#FFD60A',
    forecast: '#E5E5EA',
    fields: ['#E5E5EA', '#C7C7CC', '#A1A1A6', '#7C7C80', '#58585C', '#3A3A3C'],
  },
  light: {
    bg: '#F5F5F7',
    surface: '#FFFFFF',
    surface2: '#F2F2F5',
    surface3: '#E8E8ED',
    line: 'rgba(0, 0, 0, 0.08)',
    lineStrong: 'rgba(0, 0, 0, 0.15)',
    ink: '#1D1D1F',
    muted: '#636366',
    faint: '#AEAEB2',
    oil: '#FF9500',
    gas: '#007AFF',
    cond: '#AF52DE',
    up: '#248A3D',
    down: '#D70015',
    warn: '#B25000',
    forecast: '#3A3A3C',
    fields: ['#1D1D1F', '#48484A', '#6E6E73', '#8E8E93', '#B4B4B9', '#D1D1D6'],
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
    display: '"Inter Tight", "Inter Variable", system-ui, sans-serif',
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
