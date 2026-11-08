export interface StackSeries {
  key: string;
  values: number[];
  color: string;
}

interface MiniStackedAreaProps {
  /** Bottom layer first. All series have the same length. */
  series: StackSeries[];
  label: string;
  height?: number;
}

/** Small stacked area (no axes) for side panels; ECharts would be overkill here. */
export function MiniStackedArea({ series, label, height = 90 }: MiniStackedAreaProps) {
  const W = 300;
  const H = 80;
  const n = series[0]?.values.length ?? 0;
  if (n < 2) return null;
  const totals = Array.from({ length: n }, (_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
  const max = Math.max(...totals) || 1;
  const x = (i: number) => ((i / (n - 1)) * W).toFixed(1);
  const y = (v: number) => (H - (v / max) * (H - 2)).toFixed(1);

  const base = new Array<number>(n).fill(0);
  const paths = series.map((s) => {
    const lower = [...base];
    const upper = lower.map((b, i) => b + (s.values[i] ?? 0));
    upper.forEach((v, i) => (base[i] = v));
    const top = upper.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
    const bottom = lower
      .map((v, i) => ({ v, i }))
      .reverse()
      .map(({ v, i }) => `L${x(i)} ${y(v)}`)
      .join(' ');
    return { key: s.key, d: `${top} ${bottom} Z`, color: s.color };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="block w-full"
      style={{ height }}
    >
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.color} opacity={0.85} />
      ))}
    </svg>
  );
}
