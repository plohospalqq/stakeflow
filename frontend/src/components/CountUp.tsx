import { useCountUp } from '@/hooks/useMotion';

interface CountUpProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}

/**
 * A number that counts up to its value. Screen readers get the final value once, from a
 * hidden copy, instead of every intermediate frame.
 */
export function CountUp({ value, format, duration, className }: CountUpProps) {
  const shown = useCountUp(value, { duration });
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
