import { sparkPath } from '@/lib/spark';

interface SparklineProps {
  values: number[];
  /** Screen-reader summary. Omit for purely decorative sparklines next to a number. */
  label?: string;
  height?: number;
  color?: string;
  area?: boolean;
  strokeWidth?: number;
  /** Highlight the last segment in this colour (anomaly tails). */
  tailColor?: string;
  className?: string;
}

const W = 100;

export function Sparkline({
  values,
  label,
  height = 32,
  color = 'var(--fc)',
  area = false,
  strokeWidth = 1.5,
  tailColor,
  className,
}: SparklineProps) {
  const H = 32;
  const line = sparkPath(values, W, H);
  const tail =
    tailColor && values.length > 2
      ? (() => {
          const min = Math.min(...values);
          const range = Math.max(...values) - min || 1;
          const y = (v: number) => (H - 2 - ((v - min) / range) * (H - 4)).toFixed(2);
          const n = values.length;
          return `M${(((n - 2) / (n - 1)) * W).toFixed(2)} ${y(values[n - 2] ?? 0)} L${W} ${y(values[n - 1] ?? 0)}`;
        })()
      : '';
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block w-full overflow-visible ${className ?? ''}`}
      style={{ height }}
    >
      {area && line ? (
        <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill={color} opacity={0.07} />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {tail ? (
        <path
          d={tail}
          fill="none"
          stroke={tailColor}
          strokeWidth={strokeWidth + 1}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
