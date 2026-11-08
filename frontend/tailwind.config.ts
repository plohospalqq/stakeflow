import type { Config } from 'tailwindcss';

// Every colour is a CSS variable so one class on <html> (t-dark / t-light) re-themes
// the whole app, including charts that read the same variables at runtime.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--sf)',
        surface2: 'var(--sf2)',
        surface3: 'var(--sf3)',
        line: 'var(--bd)',
        'line-strong': 'var(--bd2)',
        ink: 'var(--tx)',
        muted: 'var(--mu)',
        faint: 'var(--fa)',
        oil: 'var(--oil)',
        gas: 'var(--gas)',
        cond: 'var(--cnd)',
        up: 'var(--up)',
        down: 'var(--dn)',
        warn: 'var(--warn)',
        'up-ink': 'var(--up-ink)',
        'down-ink': 'var(--dn-ink)',
        'warn-ink': 'var(--warn-ink)',
        forecast: 'var(--fc)',
        'field-1': 'var(--f1)',
        'field-2': 'var(--f2)',
        'field-3': 'var(--f3)',
        'field-4': 'var(--f4)',
        'field-5': 'var(--f5)',
        'field-6': 'var(--f6)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        kpi: ['30px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['22px', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['15px', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.45' }],
        label: ['12px', { lineHeight: '1.4' }],
        caption: ['11px', { lineHeight: '1.3', letterSpacing: '0.07em' }],
      },
      borderRadius: {
        chip: '6px',
        control: '10px',
        card: '12px',
      },
      screens: {
        // Sidebar navigation appears at 1024px; below that the bottom tab bar takes over.
        nav: '1024px',
      },
    },
  },
  plugins: [],
} satisfies Config;
