import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Anomaly, AnomalyStatus } from '@/api/types';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { DeltaBadge } from '@/components/DeltaBadge';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { daysInMonth } from '@/lib/dates';
import { formatMonth, formatPct } from '@/lib/format';
import { kboedToSm3 } from '@/lib/units';
import { AnomalyChart } from './AnomalyChart';

interface AnomalyItemProps {
  anomaly: Anomaly;
  /** Status after any change made in this tab. */
  status: AnomalyStatus;
  notes: string[];
  onMarkExplained: () => void;
  onAddNote: (note: string) => void;
}

export function AnomalyItem({
  anomaly: a,
  status,
  notes,
  onMarkExplained,
  onAddNote,
}: AnomalyItemProps) {
  const units = useUnits();
  const { m, t, plural } = useI18n();
  const name = useCompanyName();
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const noteId = useId();
  const digits = units.unit === 'boe' ? 1 : 3;
  // The series is kboe/d per month; Sm³ mode needs that month's real length.
  const inUnit = (kboed: number, month: string) =>
    units.fromMonth(kboedToSm3(kboed, daysInMonth(month)), month);
  const below = a.pctVsExpected < 0;
  const tail = below ? 'var(--dn)' : 'var(--up)';
  const settled = status === 'explained' || status === 'resolved';

  const save = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft('');
    setWriting(false);
  };

  return (
    <li className="card enter flex flex-wrap items-start gap-x-6 gap-y-4 p-5">
      <div className="flex min-w-0 flex-[2_1_360px] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={a.severity} />
          <StatusChip status={status} />
          <span className="lbl num">{formatMonth(a.month)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="display m-0 text-[22px] font-semibold tracking-[-0.02em]">
            <Link to={`/fields/${a.fieldId}`} className="link">
              {a.fieldName}
            </Link>
          </h3>
          <span className="flex items-center gap-1.5">
            <DeltaBadge value={a.pctVsExpected} digits={0} />
            <span className="lbl">{m.anomalies.vsExpected}</span>
          </span>
          <span className="lbl">{t(m.anomalies.operator, { name: a.operatorName })}</span>
        </div>
        {/* Notes come from the data feed; they are in English until it serves translations. */}
        <p lang="en" className="m-0 text-[14px] text-muted">
          {a.note}
        </p>
        {notes.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {notes.map((n, i) => (
              <li key={i} className="rounded-2xl bg-surface2 px-3.5 py-2.5 text-[14px]">
                <span className="lbl">{m.anomalies.yourNote}</span>
                {n}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
        <AnomalyChart
          series={a.series.map((s) => ({
            actual: inUnit(s.actual, s.month),
            lo: inUnit(s.lo, s.month),
            hi: inUnit(s.hi, s.month),
          }))}
          tailColor={tail}
          label={t(m.anomalies.chartAria, {
            field: a.fieldName,
            n: a.series.length,
            month: formatMonth(a.month),
            pct: formatPct(Math.abs(a.pctVsExpected), 0),
            direction: below ? m.anomalies.below : m.anomalies.above,
          })}
        />
        <div className="lbl num flex flex-wrap justify-between gap-x-2 text-[11px]">
          <span>{plural(m.common.months, a.series.length)}</span>
          <span>
            {t(m.anomalies.actualExpected, {
              actual: units.format(inUnit(a.actual, a.month), digits),
              expected: units.format(inUnit(a.expected, a.month), digits),
              unit: units.label,
            })}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
        <span className="cap">{m.anomalies.hits}</span>
        {a.hits.length === 0 ? (
          <span className="lbl">{m.anomalies.noFocus}</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {a.hits.map((h) => (
              <li
                key={h.companyId}
                className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]"
              >
                <Link to={`/companies/${h.companyId}`} className="link">
                  {name(h.companyId, h.companyName)}
                </Link>
                <DeltaBadge
                  value={inUnit(h.kboed, a.month)}
                  format="abs"
                  digits={digits}
                  flatBelow={0}
                  suffix={` ${units.label}`}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            aria-expanded={writing}
            aria-controls={noteId}
            onClick={() => setWriting((w) => !w)}
          >
            {m.anomalies.addNote}
          </button>
          <button type="button" className="btn" disabled={settled} onClick={onMarkExplained}>
            {settled
              ? t(m.anomalies.marked, { status: m.anomalies.status[status].toLowerCase() })
              : m.anomalies.markExplained}
          </button>
        </div>
        {writing ? (
          <form id={noteId} onSubmit={save} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              {t(m.anomalies.noteFor, { field: a.fieldName })}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="min-h-[64px] resize-y rounded-2xl border border-line bg-surface2 px-3.5 py-2.5 text-[14px] text-ink"
              />
            </label>
            <button type="submit" className="btn btn-primary self-start" disabled={!draft.trim()}>
              {m.anomalies.saveNote}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
