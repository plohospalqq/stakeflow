interface SampleBadgeProps {
  /** Shown when hovering/focusing: what exactly is sample here. */
  detail?: string;
  className?: string;
}

/**
 * Marks numbers that come from the mock layer, not from Sodir. Every card or section
 * that shows mock data carries one, so a sample number is never mistaken for a real one.
 */
export function SampleBadge({ detail, className }: SampleBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-chip border border-dashed border-[color-mix(in_srgb,var(--warn)_55%,transparent)] px-1.5 py-px text-[11px] font-medium text-warn ${className ?? ''}`}
      title={detail ?? 'Generated sample data: the backend does not serve this yet.'}
    >
      Sample data
      <span className="sr-only">
        {detail ? `: ${detail}` : ': generated, not from Sodir or company reports'}
      </span>
    </span>
  );
}
