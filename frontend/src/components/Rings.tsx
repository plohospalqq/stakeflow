import { useReveal } from '@/hooks/useMotion';

export interface RingValue {
  key: string;
  /** 0..1 */
  value: number;
  color: string;
}

interface RingsProps {
  rings: RingValue[];
  /** Screen-reader summary; the rings themselves are decorative. */
  label: string;
  size?: number;
  stroke?: number;
}

/**
 * Concentric "activity" rings, outermost first: one per product share. Drawn complete at
 * rest; the stroke replays from empty when the rings scroll into view.
 */
export function Rings({ rings, label, size = 220, stroke = 20 }: RingsProps) {
  const [ref, reveal] = useReveal<SVGSVGElement>();
  const c = size / 2;
  const gap = 4;
  return (
    <svg
      ref={ref}
      data-reveal={reveal}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="max-w-full flex-none"
    >
      {rings.map((ring, i) => {
        const r = c - stroke / 2 - i * (stroke + gap);
        if (r <= stroke / 2) return null;
        const len = 2 * Math.PI * r;
        const value = Math.min(1, Math.max(0, ring.value));
        return (
          <g key={ring.key} transform={`rotate(-90 ${c} ${c})`}>
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeOpacity={0.16}
              strokeWidth={stroke}
            />
            <circle
              className="draw-ring"
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${len} ${len}`}
              strokeDashoffset={len * (1 - value)}
              style={{ '--len': len, '--i': i }}
            />
          </g>
        );
      })}
    </svg>
  );
}
