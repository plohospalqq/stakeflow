import { useId } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useReveal } from '@/hooks/useMotion';
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

/**
 * A line that draws itself when it scrolls into view and is complete at rest. Drawn in
 * real pixels (measured width), so the stroke is never stretched.
 */
export function Sparkline({
  values,
  label,
  height = 32,
  color = 'var(--fc)',
  area = false,
  strokeWidth = 2,
  tailColor,
  className,
}: SparklineProps) {
  const [box, width] = useElementWidth<HTMLDivElement>(120);
  const [ref, reveal] = useReveal<SVGSVGElement>();
  const gradient = useId();
  const pad = strokeWidth + 1;
  const line = sparkPath(values, width, height, pad);
  const n = values.length;
  const tail =
    tailColor && n > 2
      ? (() => {
          const min = Math.min(...values);
          const range = Math.max(...values) - min || 1;
          const y = (v: number) =>
            (height - pad - ((v - min) / range) * (height - pad * 2)).toFixed(2);
          return `M${(((n - 2) / (n - 1)) * width).toFixed(2)} ${y(values[n - 2] ?? 0)} L${width} ${y(values[n - 1] ?? 0)}`;
        })()
      : '';
  return (
    <div ref={box} className={`w-full ${className ?? ''}`} style={{ height }}>
      <svg
        ref={ref}
        data-reveal={reveal}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className="block overflow-visible"
      >
        {area && line ? (
          <>
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.24} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${gradient})`} />
          </>
        ) : null}
        <path
          className="draw"
          d={line}
          pathLength={1}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {tail ? (
          <path
            d={tail}
            fill="none"
            stroke={tailColor}
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </div>
  );
}
