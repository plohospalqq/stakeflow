interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ width = '100%', height = 12, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton block ${className ?? ''}`}
      style={{ width, height }}
    />
  );
}
