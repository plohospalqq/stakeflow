import { useCallback, useMemo } from 'react';
import type { Prediction } from '@/api/types';
import { ErrorChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { Icon } from '@/components/Icon';
import { SampleBadge } from '@/components/SampleBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useUnits, type Units } from '@/hooks/useUnits';
import type { Dict } from '@/i18n/types';
import { fill } from '@/i18n/text';
import { useI18n } from '@/i18n/useI18n';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { quarterOf } from '@/lib/dates';
import { formatDate, formatQuarter, formatUtc } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safeUrl';
import { errorPct, leadDays } from '@/lib/trackRecord';

interface Row {
  p: Prediction;
  /** Report date: actual when published, expected while open. */
  reportOn: string;
  lead: number;
  error: number | null;
  inRange: boolean | null;
}

function toRow(p: Prediction): Row {
  const open = p.status === 'open' || p.actual === null;
  const reportOn = p.reportedOn ?? p.expectedReportOn;
  // An open quarter freezes at quarter end, so its lead is counted from there.
  const frozenAt = open ? `${quarterOf(p.quarterStart).end}T23:59:00Z` : p.madeAt;
  return {
    p,
    reportOn,
    lead: leadDays(frozenAt, reportOn),
    error: open || p.actual === null ? null : errorPct(p.predicted, p.actual),
    inRange: open || p.actual === null ? null : p.actual >= p.lo && p.actual <= p.hi,
  };
}

function columns(
  units: Units,
  m: Dict,
  name: (id: string, fallback?: string) => string,
): Column<Row>[] {
  const digits = units.unit === 'boe' ? 1 : 3;
  const conv = (r: Row, v: number) => units.fromQuarterRate(v, r.p.quarterStart);
  const open = (r: Row) => r.error === null;
  return [
    {
      id: 'quarter',
      header: m.common.quarter,
      value: (r) => r.p.quarterStart,
      cell: (r) => <span className="num">{formatQuarter(r.p.quarterStart)}</span>,
    },
    {
      id: 'company',
      header: m.common.company,
      value: (r) => name(r.p.companyId, r.p.companyName),
    },
    {
      id: 'made',
      header: m.track.colMade,
      value: (r) => r.p.madeAt,
      cell: (r) =>
        open(r) ? (
          <span className="chip">
            <span className="dot rounded-full bg-warn" aria-hidden="true" />
            {fill(m.track.live, { date: formatDate(quarterOf(r.p.quarterStart).end) })}
          </span>
        ) : (
          <span className="num text-muted">{formatUtc(r.p.madeAt)}</span>
        ),
    },
    {
      id: 'report',
      header: m.track.colReport,
      value: (r) => r.reportOn,
      cell: (r) => (
        <span className="num text-muted">
          {open(r) ? '≈ ' : ''}
          {formatDate(r.reportOn)}
        </span>
      ),
    },
    {
      id: 'lead',
      header: m.track.colLead,
      align: 'right',
      value: (r) => r.lead,
      cell: (r) => `${open(r) ? '≈' : ''}${fill(m.track.leadDays, { n: r.lead })}`,
    },
    {
      id: 'predicted',
      header: m.track.colPredicted,
      align: 'right',
      value: (r) => conv(r, r.p.predicted),
      cell: (r) => <strong>{units.format(conv(r, r.p.predicted), digits)}</strong>,
    },
    {
      id: 'range',
      header: m.track.colRange,
      align: 'right',
      sortable: false,
      value: (r) => conv(r, r.p.lo),
      cell: (r) => (
        <span className="text-muted">
          {units.format(conv(r, r.p.lo), digits)}–{units.format(conv(r, r.p.hi), digits)}
        </span>
      ),
    },
    {
      id: 'actual',
      header: m.track.colActual,
      align: 'right',
      value: (r) => (r.p.actual === null ? null : conv(r, r.p.actual)),
      cell: (r) =>
        r.p.actual === null ? (
          <span className="text-muted">{m.track.awaiting}</span>
        ) : (
          units.format(conv(r, r.p.actual), digits)
        ),
    },
    {
      id: 'error',
      header: m.track.colError,
      align: 'right',
      value: (r) => r.error,
      cell: (r) =>
        r.error === null ? (
          <span className="chip">{m.track.open}</span>
        ) : (
          <ErrorChip value={r.error} />
        ),
    },
    {
      id: 'inRange',
      header: m.track.colInRange,
      value: (r) => (r.inRange === null ? null : r.inRange ? 1 : 0),
      cell: (r) =>
        r.inRange === null ? (
          <span className="text-muted">–</span>
        ) : r.inRange ? (
          <span className="inline-flex items-center gap-1 text-up-ink">
            <Icon name="check" size={14} />
            {m.common.yes}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-warn-ink">
            <Icon name="close" size={14} />
            {m.common.no}
          </span>
        ),
    },
    {
      id: 'proof',
      header: m.track.colProof,
      sortable: false,
      value: (r) => r.p.hash,
      cell: (r) => {
        const href = safeExternalUrl(r.p.commitUrl);
        const short = r.p.hash.slice(0, 7);
        if (open(r)) return <span className="num lbl">{m.track.pending}</span>;
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="num text-[12px] text-muted underline underline-offset-2 hover:text-ink"
          >
            {short}
            <span className="sr-only">{m.track.commitSr}</span>
          </a>
        ) : (
          <span className="num lbl" title={m.track.sampleRow}>
            {short}
            <span className="sr-only">{m.track.sampleRowSr}</span>
          </span>
        );
      },
    },
  ];
}

function toCsv(rows: Row[]): string {
  return rowsToCsv(
    [
      { header: 'quarter', value: (r: Row) => formatQuarter(r.p.quarterStart) },
      { header: 'company', value: (r) => r.p.companyName },
      { header: 'status', value: (r) => r.p.status },
      { header: 'made_at_utc', value: (r) => r.p.madeAt },
      { header: 'report_date', value: (r) => r.reportOn },
      { header: 'lead_days', value: (r) => r.lead },
      { header: 'predicted_kboe_d', value: (r) => r.p.predicted },
      { header: 'lo_kboe_d', value: (r) => r.p.lo },
      { header: 'hi_kboe_d', value: (r) => r.p.hi },
      { header: 'actual_kboe_d', value: (r) => r.p.actual },
      { header: 'baseline_kboe_d', value: (r) => r.p.baseline },
      {
        header: 'error_pct',
        value: (r) => (r.error === null ? null : Math.round(r.error * 100) / 100),
      },
      { header: 'in_range', value: (r) => (r.inRange === null ? null : String(r.inRange)) },
      { header: 'hash', value: (r) => r.p.hash },
      { header: 'model_version', value: (r) => r.p.modelVersion },
      { header: 'sample_data', value: () => 'true' },
    ],
    rows,
  );
}

/** Open quarters on top, then newest first; companies in a stable order within a quarter. */
export function PredictionLog({
  predictions,
  loading,
}: {
  predictions: Prediction[];
  loading: boolean;
}) {
  const units = useUnits();
  const { m, t } = useI18n();
  const name = useCompanyName();
  const rows = useMemo(
    () =>
      predictions
        .map(toRow)
        .sort(
          (a, b) =>
            Number(b.error === null) - Number(a.error === null) ||
            b.p.quarterStart.localeCompare(a.p.quarterStart) ||
            a.p.companyName.localeCompare(b.p.companyName) ||
            b.p.madeAt.localeCompare(a.p.madeAt),
        ),
    [predictions],
  );
  const cols = useMemo(() => columns(units, m, name), [units, m, name]);
  const download = useCallback(
    () => downloadCsv('stakeflow-prediction-log-sample.csv', toCsv(rows)),
    [rows],
  );

  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="log-h">
      <SectionHeading
        id="log-h"
        title={
          <>
            {m.track.logTitle}
            <SampleBadge detail={m.sample.log} />
          </>
        }
        sub={t(m.track.logSub, { unit: units.label })}
        actions={
          <button type="button" className="btn" onClick={download} disabled={rows.length === 0}>
            <Icon name="download" />
            {m.common.downloadCsv}
          </button>
        }
      />
      <div className="px-2 pb-2">
        <DataTable
          caption={m.track.logCaption}
          columns={cols}
          rows={rows}
          rowKey={(r) => r.p.id}
          loading={loading}
          dense
          rowClassName={(r) => (r.error === null ? 'bg-surface2' : undefined)}
        />
      </div>
      <p className="lbl m-0 px-5 pb-5 pt-3">{m.track.logNote}</p>
    </section>
  );
}
