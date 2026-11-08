import { useCallback, useMemo } from 'react';
import type { Prediction } from '@/api/types';
import { ErrorChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { Icon } from '@/components/Icon';
import { SampleBadge } from '@/components/SampleBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { useUnits, type Units } from '@/hooks/useUnits';
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

function columns(units: Units): Column<Row>[] {
  const digits = units.unit === 'boe' ? 1 : 3;
  const conv = (r: Row, v: number) => units.fromQuarterRate(v, r.p.quarterStart);
  const open = (r: Row) => r.error === null;
  return [
    {
      id: 'quarter',
      header: 'Quarter',
      value: (r) => r.p.quarterStart,
      cell: (r) => <span className="num">{formatQuarter(r.p.quarterStart)}</span>,
    },
    { id: 'company', header: 'Company', value: (r) => r.p.companyName },
    {
      id: 'made',
      header: 'Prediction made',
      value: (r) => r.p.madeAt,
      cell: (r) =>
        open(r) ? (
          <span className="chip">
            <span className="dot rounded-full bg-warn" aria-hidden="true" />
            Live · freezes {formatDate(quarterOf(r.p.quarterStart).end)} 23:59 UTC
          </span>
        ) : (
          <span className="num text-muted">{formatUtc(r.p.madeAt)}</span>
        ),
    },
    {
      id: 'report',
      header: 'Report published',
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
      header: 'Lead',
      align: 'right',
      value: (r) => r.lead,
      cell: (r) => `${open(r) ? '≈' : ''}${r.lead} d`,
    },
    {
      id: 'predicted',
      header: 'Predicted',
      align: 'right',
      value: (r) => conv(r, r.p.predicted),
      cell: (r) => <strong>{units.format(conv(r, r.p.predicted), digits)}</strong>,
    },
    {
      id: 'range',
      header: '80% range',
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
      header: 'Actual',
      align: 'right',
      value: (r) => (r.p.actual === null ? null : conv(r, r.p.actual)),
      cell: (r) =>
        r.p.actual === null ? (
          <span className="text-muted">Awaiting</span>
        ) : (
          units.format(conv(r, r.p.actual), digits)
        ),
    },
    {
      id: 'error',
      header: 'Error',
      align: 'right',
      value: (r) => r.error,
      cell: (r) =>
        r.error === null ? <span className="chip">Open</span> : <ErrorChip value={r.error} />,
    },
    {
      id: 'inRange',
      header: 'In range',
      value: (r) => (r.inRange === null ? null : r.inRange ? 1 : 0),
      cell: (r) =>
        r.inRange === null ? (
          <span className="text-muted">–</span>
        ) : r.inRange ? (
          <span className="inline-flex items-center gap-1 text-up">
            <Icon name="check" size={14} />
            Yes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-warn">
            <Icon name="close" size={14} />
            No
          </span>
        ),
    },
    {
      id: 'proof',
      header: 'Proof',
      sortable: false,
      value: (r) => r.p.hash,
      cell: (r) => {
        const href = safeExternalUrl(r.p.commitUrl);
        const short = r.p.hash.slice(0, 7);
        if (open(r)) return <span className="num lbl">pending</span>;
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="num text-[12px] text-muted underline underline-offset-2 hover:text-ink"
          >
            {short}
            <span className="sr-only"> (commit, opens in a new tab)</span>
          </a>
        ) : (
          <span className="num lbl" title="Sample row: no commit exists">
            {short}
            <span className="sr-only"> (sample, not committed)</span>
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
  const cols = useMemo(() => columns(units), [units]);
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
            Prediction log
            <SampleBadge detail="Sample predictions until the nowcast model is in the backend" />
          </>
        }
        sub={`Open quarters first, then newest. Times in UTC · ${units.label}`}
        actions={
          <button type="button" className="btn" onClick={download} disabled={rows.length === 0}>
            <Icon name="download" />
            Download CSV
          </button>
        }
      />
      <div className="px-1.5 pb-1.5">
        <DataTable
          caption="Prediction log: every quarterly nowcast with its score (sample data)"
          columns={cols}
          rows={rows}
          rowKey={(r) => r.p.id}
          loading={loading}
          dense
          rowClassName={(r) => (r.error === null ? 'bg-surface2' : undefined)}
        />
      </div>
      <p className="lbl m-0 border-t border-line px-[18px] pb-4 pt-3">
        Error = (predicted − actual) ÷ actual: green under 2%, amber 2–4%, red above 4%. Lead =
        report date − prediction time. An open quarter keeps updating until it freezes at quarter
        end, and is scored when the company publishes its trading update.
      </p>
    </section>
  );
}
