import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ReportedQuarter } from '@/api/types';
import { ErrorChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { Icon } from '@/components/Icon';
import { useUnits, type Units } from '@/hooks/useUnits';
import { COMPANY_META } from '@/lib/companies';
import { formatDate, formatQuarter } from '@/lib/format';

export interface ReconRow {
  companyId: string;
  quarter: ReportedQuarter;
}

function columns(units: Units, showCompany: boolean): Column<ReconRow>[] {
  const digits = units.unit === 'boe' ? 1 : 3;
  const value = (r: ReconRow, kboed: number | null) =>
    kboed === null ? null : units.fromQuarterRate(kboed, r.quarter.quarterStart);
  return [
    {
      id: 'quarter',
      header: 'Quarter',
      value: (r) => r.quarter.quarterStart,
      cell: (r) => <span className="num">{formatQuarter(r.quarter.quarterStart)}</span>,
    },
    ...(showCompany
      ? [
          {
            id: 'company',
            header: 'Company',
            value: (r: ReconRow) => COMPANY_META[r.companyId]?.name ?? r.companyId,
            cell: (r: ReconRow) => (
              <Link to={`/companies/${r.companyId}`} className="link">
                {COMPANY_META[r.companyId]?.name ?? r.companyId}
              </Link>
            ),
          },
        ]
      : []),
    {
      id: 'months',
      header: 'Sodir data',
      value: (r) => r.quarter.monthsInData,
      cell: (r) =>
        r.quarter.isComplete ? (
          <span className="text-muted">3 of 3 months</span>
        ) : (
          <span className="chip">{r.quarter.monthsInData} of 3 months · provisional</span>
        ),
    },
    {
      id: 'attributed',
      header: 'Sodir-attributed',
      align: 'right',
      value: (r) => value(r, r.quarter.attributedKboed),
      cell: (r) => units.format(value(r, r.quarter.attributedKboed) ?? 0, digits),
    },
    {
      id: 'reported',
      header: 'Reported',
      align: 'right',
      value: (r) => value(r, r.quarter.reportedKboed),
      cell: (r) => {
        const v = value(r, r.quarter.reportedKboed);
        return v === null ? '–' : <strong>{units.format(v, digits)}</strong>;
      },
    },
    {
      id: 'gap',
      header: 'Gap',
      align: 'right',
      value: (r) => r.quarter.errorPct,
      cell: (r) =>
        r.quarter.errorPct === null ? '–' : <ErrorChip value={r.quarter.errorPct} digits={2} />,
    },
    {
      id: 'reportedOn',
      header: 'Published',
      value: (r) => r.quarter.reportedOn,
      cell: (r) => (
        <span className="num text-muted">
          {r.quarter.reportedOn ? formatDate(r.quarter.reportedOn) : '–'}
        </span>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      sortable: false,
      value: (r) => r.quarter.sourceUrl,
      // sourceUrl went through safeExternalUrl in the API mapping: https and known hosts only.
      cell: (r) =>
        r.quarter.sourceUrl ? (
          <a
            href={r.quarter.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted underline underline-offset-2 hover:text-ink"
          >
            Trading update
            <Icon name="external" size={12} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
  ];
}

export function ReconciliationTable({
  rows,
  showCompany = false,
  loading = false,
  caption,
  empty,
}: {
  rows: ReconRow[];
  showCompany?: boolean;
  loading?: boolean;
  caption: string;
  empty?: string;
}) {
  const units = useUnits();
  const cols = useMemo(() => columns(units, showCompany), [units, showCompany]);
  return (
    <DataTable
      caption={caption}
      columns={cols}
      rows={rows}
      rowKey={(r) => `${r.companyId}-${r.quarter.quarterStart}`}
      loading={loading}
      dense
      empty={empty}
    />
  );
}
