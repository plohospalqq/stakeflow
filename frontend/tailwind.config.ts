import type { Config } from 'tailwindcss';

// Every colour is a CSS variable so one class on <html> (t-dark / t-light) re-themes
// the whole app, including charts and the map, which read the same variables at runtime.
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
        'oil-ink': 'var(--oil-ink)',
        'gas-ink': 'var(--gas-ink)',
        'cond-ink': 'var(--cnd-ink)',
        up: 'var(--up)',
        down: 'var(--dn)',
        warn: 'var(--warn)',
        'up-ink': 'var(--up-ink)',
        'down-ink': 'var(--dn-ink)',
        'warn-ink': 'var(--warn-ink)',
        forecast: 'var(--fc)',
        focus: 'var(--focus)',
        'field-1': 'var(--f1)',
        'field-2': 'var(--f2)',
        'field-3': 'var(--f3)',
        'field-4': 'var(--f4)',
        'field-5': 'var(--f5)',
        'field-6': 'var(--f6)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', '"SF Pro Display"', '"Inter Variable"', 'system-ui'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // Type scale: display sizes are Inter Tight with tight tracking (set by .display).
      fontSize: {
        hero: ['clamp(88px, 15vw, 210px)', { lineHeight: '0.9', letterSpacing: '-0.055em' }],
        'display-xl': [
          'clamp(38px, 5.2vw, 64px)',
          { lineHeight: '1.04', letterSpacing: '-0.04em' },
        ],
        'display-l': [
          'clamp(30px, 3.4vw, 40px)',
          { lineHeight: '1.08', letterSpacing: '-0.035em' },
        ],
        kpi: ['44px', { lineHeight: '1', letterSpacing: '-0.045em' }],
        'kpi-sm': ['30px', { lineHeight: '1.05', letterSpacing: '-0.035em' }],
        h1: ['34px', { lineHeight: '1.1', letterSpacing: '-0.035em' }],
        h2: ['19px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        body: ['15px', { lineHeight: '1.47' }],
        label: ['13px', { lineHeight: '1.4' }],
        caption: ['12px', { lineHeight: '1.3', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        chip: '999px',
        control: '14px',
        card: '24px',
        tile: '28px',
        stage: '32px',
      },
      screens: {
        // Desktop navigation appears at 1024px; below that the bottom tab bar takes over.
        nav: '1024px',
      },
    },
  },
  plugins: [],
} satisfies Config;
