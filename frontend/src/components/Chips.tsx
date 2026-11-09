import type { ReactNode } from 'react';
import type { AnomalyStatus, Severity } from '@/api/types';
import { useFieldStatusLabel } from '@/hooks/useFieldStatusLabel';
import { useI18n } from '@/i18n/useI18n';
import { formatPct } from '@/lib/format';
import { errorTone, type ErrorTone } from '@/lib/trackRecord';

const SEVERITY_CLASS: Record<Severity, string> = {
  high: 'text-down-ink bg-[color-mix(in_srgb,var(--dn)_12%,transparent)]',
  medium: 'text-warn-ink bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]',
  low: '',
};

export function SeverityChip({ severity, className }: { severity: Severity; className?: string }) {
  const { m } = useI18n();
  return (
    <span className={`chip ${SEVERITY_CLASS[severity]} ${className ?? ''}`}>
      <span className="sr-only">{m.anomalies.severitySr}</span>
      {m.anomalies.severity[severity]}
    </span>
  );
}

// Product colours are reserved for products, so "investigating" uses the neutral
// forecast colour rather than a blue.
const STATUS_DOT: Record<AnomalyStatus, string> = {
  new: 'var(--warn)',
  investigating: 'var(--fc)',
  explained: 'var(--mu)',
  resolved: 'var(--up)',
};

export function StatusChip({ status }: { status: AnomalyStatus }) {
  const { m } = useI18n();
  return (
    <span className={`chip ${status === 'new' ? 'text-ink' : ''}`}>
      <span className="dot" style={{ background: STATUS_DOT[status] }} aria-hidden="true" />
      <span className="sr-only">{m.anomalies.statusSr}</span>
      {m.anomalies.status[status]}
    </span>
  );
}

const FIELD_STATUS_DOT: Record<string, string> = {
  Producing: 'var(--up)',
  'Approved for production': 'var(--warn)',
  'Shut down': 'var(--fa)',
};

export function FieldStatusChip({ status }: { status: string }) {
  const label = useFieldStatusLabel();
  const dot = FIELD_STATUS_DOT[status] ?? 'var(--fa)';
  return (
    <span className={`chip ${status === 'Producing' ? 'text-up-ink' : ''}`}>
      <span className="dot" style={{ background: dot }} aria-hidden="true" />
      {label(status)}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`chip ${className ?? ''}`}>{children}</span>;
}

const ERROR_TONE: Record<ErrorTone, string> = {
  good: 'text-up-ink bg-[color-mix(in_srgb,var(--up)_12%,transparent)]',
  fair: 'text-warn-ink bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]',
  poor: 'text-down-ink bg-[color-mix(in_srgb,var(--dn)_12%,transparent)]',
};

/**
 * A signed forecast error or data gap in percent. Colour follows the size of the miss
 * (green under 2%, amber 2–4%, red above), the number itself carries the direction.
 */
export function ErrorChip({ value, digits = 1 }: { value: number; digits?: number }) {
  return (
    <span
      className={`num inline-flex rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${ERROR_TONE[errorTone(value)]}`}
    >
      {formatPct(value, digits, true)}
    </span>
  );
}
