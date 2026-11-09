import { useI18n } from '@/i18n/useI18n';

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
  const { m } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-[color-mix(in_srgb,var(--warn)_60%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-2 py-px text-[11px] font-semibold uppercase tracking-[0.04em] text-warn-ink ${className ?? ''}`}
      title={detail ?? m.sample.title}
    >
      {m.sample.badge}
      <span className="sr-only">{detail ? `: ${detail}` : m.sample.sr}</span>
    </span>
  );
}
