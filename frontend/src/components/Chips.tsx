import type { ReactNode } from 'react';

export type Severity = 'high' | 'medium' | 'low';
export type AnomalyStatus = 'new' | 'investigating' | 'explained' | 'resolved';

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  high: {
    label: 'High',
    className:
      'text-down border-[color-mix(in_srgb,var(--dn)_40%,transparent)] bg-[color-mix(in_srgb,var(--dn)_8%,transparent)]',
  },
  medium: {
    label: 'Medium',
    className:
      'text-warn border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]',
  },
  low: { label: 'Low', className: '' },
};

export function SeverityChip({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity];
  return (
    <span className={`chip ${s.className} ${className ?? ''}`}>
      <span className="sr-only">Severity: </span>
      {s.label}
    </span>
  );
}

// Product colours are reserved for products, so "investigating" uses the neutral
// forecast colour rather than the gas blue the mock-up used.
const STATUS: Record<AnomalyStatus, { label: string; dot: string; className?: string }> = {
  new: { label: 'New', dot: 'var(--warn)', className: 'text-ink border-line-strong' },
  investigating: { label: 'Investigating', dot: 'var(--fc)' },
  explained: { label: 'Explained', dot: 'var(--mu)' },
  resolved: { label: 'Resolved', dot: 'var(--up)' },
};

export function StatusChip({ status }: { status: AnomalyStatus }) {
  const s = STATUS[status];
  return (
    <span className={`chip ${s.className ?? ''}`}>
      <span className="dot rounded-full" style={{ background: s.dot }} aria-hidden="true" />
      <span className="sr-only">Status: </span>
      {s.label}
    </span>
  );
}

const FIELD_STATUS_DOT: Record<string, string> = {
  Producing: 'var(--up)',
  'Approved for production': 'var(--warn)',
  'Shut down': 'var(--fa)',
};

export function FieldStatusChip({ status }: { status: string }) {
  const dot = FIELD_STATUS_DOT[status] ?? 'var(--fa)';
  return (
    <span className="chip" style={status === 'Producing' ? { color: 'var(--up)' } : undefined}>
      <span className="dot rounded-full" style={{ background: dot }} aria-hidden="true" />
      {status}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`chip ${className ?? ''}`}>{children}</span>;
}
