import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ReportedQuarter } from '@/api/types';
import { ErrorChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { Icon } from '@/components/Icon';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useUnits, type Units } from '@/hooks/useUnits';
import type { Dict } from '@/i18n/types';
import { fill } from '@/i18n/text';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatQuarter } from '@/lib/format';

export interface ReconRow {
  companyId: string;
  quarter: ReportedQuarter;
}

function columns(
  units: Units,
  showCompany: boolean,
  m: Dict,
  name: (id: string) => string,
): Column<ReconRow>[] {
  const digits = units.unit === 'boe' ? 1 : 3;
  const value = (r: ReconRow, kboed: number | null) =>
    kboed === null ? null : units.fromQuarterRate(kboed, r.quarter.quarterStart);
  return [
    {
      id: 'quarter',
      header: m.recon.colQuarter,
      value: (r) => r.quarter.quarterStart,
      cell: (r) => <span className="num">{formatQuarter(r.quarter.quarterStart)}</span>,
    },
    ...(showCompany
      ? [
          {
            id: 'company',
            header: m.recon.colCompany,
            value: (r: ReconRow) => name(r.companyId),
            cell: (r: ReconRow) => (
              <Link to={`/companies/${r.companyId}`} className="link">
                {name(r.companyId)}
              </Link>
            ),
          },
        ]
      : []),
    {
      id: 'months',
      header: m.recon.colMonths,
      value: (r) => r.quarter.monthsInData,
      cell: (r) =>
        r.quarter.isComplete ? (
          <span className="text-muted">{m.recon.complete}</span>
        ) : (
          <span className="chip">{fill(m.recon.provisional, { n: r.quarter.monthsInData })}</span>
        ),
    },
    {
      id: 'attributed',
      header: m.recon.colAttributed,
      align: 'right',
      value: (r) => value(r, r.quarter.attributedKboed),
      cell: (r) => units.format(value(r, r.quarter.attributedKboed) ?? 0, digits),
    },
    {
      id: 'reported',
      header: m.recon.colReported,
      align: 'right',
      value: (r) => value(r, r.quarter.reportedKboed),
      cell: (r) => {
        const v = value(r, r.quarter.reportedKboed);
        return v === null ? '–' : <strong>{units.format(v, digits)}</strong>;
      },
    },
    {
      id: 'gap',
      header: m.recon.colGap,
      align: 'right',
      value: (r) => r.quarter.errorPct,
      cell: (r) =>
        r.quarter.errorPct === null ? '–' : <ErrorChip value={r.quarter.errorPct} digits={2} />,
    },
    {
      id: 'reportedOn',
      header: m.recon.colPublished,
      value: (r) => r.quarter.reportedOn,
      cell: (r) => (
        <span className="num text-muted">
          {r.quarter.reportedOn ? formatDate(r.quarter.reportedOn) : '–'}
        </span>
      ),
    },
    {
      id: 'source',
      header: m.recon.colSource,
      sortable: false,
      value: (r) => r.quarter.sourceUrl,
      // sourceUrl went through safeExternalUrl in the API mapping: https and known hosts only.
      cell: (r) =>
        r.quarter.sourceUrl ? (
          <a
            href={r.quarter.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[32px] items-center gap-1 text-muted underline underline-offset-2 hover:text-ink max-nav:min-h-[44px]"
          >
            {m.recon.report}
            <Icon name="external" size={12} />
            <span className="sr-only">{m.common.opensNewTab}</span>
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
  const { m } = useI18n();
  const name = useCompanyName();
  const cols = useMemo(() => columns(units, showCompany, m, name), [units, showCompany, m, name]);
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
