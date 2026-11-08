import { useUnits } from '@/hooks/useUnits';
import { FreshnessText } from './DataStatus';

/** Mobile replacement for the sidebar's data-status card: one line under the title. */
export function FreshnessLine({ className }: { className?: string }) {
  const { label } = useUnits();
  return (
    <span className={`lbl flex items-center gap-1.5 ${className ?? ''}`}>
      <FreshnessText latestMonth={undefined} /> · {label}
    </span>
  );
}
