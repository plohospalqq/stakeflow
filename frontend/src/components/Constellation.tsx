import { oilShareColor } from '@/lib/mapScale';

export interface StarPoint {
  id: number;
  lon: number;
  lat: number;
  kboed: number;
  oilShare: number;
}

/** Map projection good enough for a thumbnail: longitudes shrink with cos(latitude). */
const COS_LAT = Math.cos((64 * Math.PI) / 180);

/**
 * The shelf as a night sky: every field a glowing dot at its real position, sized by
 * √production and coloured oil → gas. Decorative thumbnail; the map page has the details.
 */
export function Constellation({ points, label }: { points: StarPoint[]; label: string }) {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.lon * COS_LAT);
  const ys = points.map((p) => -p.lat);
  const pad = 1.4;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;
  const scale = w / 300;
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      role="img"
      aria-label={label}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {points.map((p, i) => {
        const r = (1.4 + Math.sqrt(p.kboed) * 0.42) * scale;
        const color = oilShareColor(p.oilShare);
        return (
          <g key={p.id}>
            <circle cx={xs[i]} cy={ys[i]} r={r * 3} style={{ fill: color }} opacity={0.18} />
            <circle cx={xs[i]} cy={ys[i]} r={r} style={{ fill: color }} opacity={0.95} />
          </g>
        );
      })}
    </svg>
  );
}
