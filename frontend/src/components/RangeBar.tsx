interface RangeBarProps {
  value: number;
  lo: number;
  hi: number;
  /** A comparison point drawn as a hollow circle, e.g. last reported quarter. */
  reference?: number;
  className?: string;
}

/** Nowcast with its 80% range and a reference marker. Decorative: numbers sit beside it. */
export function RangeBar({ value, lo, hi, reference, className }: RangeBarProps) {
  const points = [lo, hi, value, ...(reference !== undefined ? [reference] : [])];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = (max - min) * 0.12 || 1;
  const scale = (v: number) => `${(((v - (min - pad)) / (max - min + pad * 2)) * 100).toFixed(2)}%`;
  const width = `${(((hi - lo) / (max - min + pad * 2)) * 100).toFixed(2)}%`;
  return (
    <div className={`relative h-[22px] ${className ?? ''}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-[10px] h-0.5 rounded-sm bg-surface3" />
      <div
        className="absolute top-[7px] h-2 rounded"
        style={{
          left: scale(lo),
          width,
          background: 'color-mix(in srgb, var(--fc) 28%, transparent)',
        }}
      />
      <div className="absolute top-[3px] h-4 w-0.5 bg-forecast" style={{ left: scale(value) }} />
      {reference !== undefined ? (
        <div
          className="absolute top-[5px] -ml-1.5 h-3 w-3 rounded-full border-2 border-muted bg-surface"
          style={{ left: scale(reference) }}
        />
      ) : null}
    </div>
  );
}
