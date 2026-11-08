interface AnomalyChartProps {
  /** Oldest first, display unit. */
  series: { actual: number; lo: number; hi: number }[];
  /** Colour of the last segment: the month that triggered the anomaly. */
  tailColor: string;
  label: string;
}

const W = 240;
const H = 70;

/** Actual output against the expected band; the final segment is the anomaly. */
export function AnomalyChart({ series, tailColor, label }: AnomalyChartProps) {
  const n = series.length;
  if (n < 2) return null;
  const values = series.flatMap((s) => [s.actual, s.lo, s.hi]);
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values) * 1.02;
  const x = (i: number) => ((i / (n - 1)) * W).toFixed(1);
  const y = (v: number) => (H - ((v - min) / (max - min || 1)) * H).toFixed(1);

  const upper = series.map((s, i) => `${i ? 'L' : 'M'}${x(i)} ${y(s.hi)}`).join(' ');
  const lower = series
    .map((s, i) => ({ s, i }))
    .reverse()
    .map(({ s, i }) => `L${x(i)} ${y(s.lo)}`)
    .join(' ');
  const line = series
    .slice(0, -1)
    .map((s, i) => `${i ? 'L' : 'M'}${x(i)} ${y(s.actual)}`)
    .join(' ');
  const prev = series[n - 2];
  const last = series[n - 1];
  const tail = prev && last ? `M${x(n - 2)} ${y(prev.actual)} L${x(n - 1)} ${y(last.actual)}` : '';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="block h-[70px] w-full overflow-visible"
    >
      <path d={`${upper} ${lower} Z`} fill="var(--fc)" opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="var(--fc)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={tail}
        fill="none"
        stroke={tailColor}
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
