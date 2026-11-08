import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Anomaly, AnomalyStatus } from '@/api/types';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { DeltaBadge } from '@/components/DeltaBadge';
import { useUnits } from '@/hooks/useUnits';
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
    <li className="card flex flex-wrap items-start gap-x-6 gap-y-4 px-[18px] py-4">
      <div className="flex min-w-0 flex-[2_1_360px] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={a.severity} />
          <StatusChip status={status} />
          <span className="lbl num">{formatMonth(a.month)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="m-0 text-[17px] font-semibold">
            <Link to={`/fields/${a.fieldId}`} className="link">
              {a.fieldName}
            </Link>
          </h3>
          <span className="flex items-center gap-1.5">
            <DeltaBadge value={a.pctVsExpected} digits={0} />
            <span className="lbl">vs expected</span>
          </span>
          <span className="lbl">Operator {a.operatorName}</span>
        </div>
        <p className="m-0 text-[13px] text-muted">{a.note}</p>
        {notes.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {notes.map((n, i) => (
              <li key={i} className="rounded-control bg-surface2 px-3 py-2 text-[13px]">
                <span className="lbl">Your note (this tab only): </span>
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
          label={`${a.fieldName} output over ${a.series.length} months; ${formatMonth(a.month)} was ${formatPct(
            Math.abs(a.pctVsExpected),
            0,
          )} ${below ? 'below' : 'above'} the expected range`}
        />
        <div className="lbl num flex flex-wrap justify-between gap-x-2 text-[11px]">
          <span>{a.series.length} months</span>
          <span>
            actual {units.format(inUnit(a.actual, a.month), digits)} · expected{' '}
            {units.format(inUnit(a.expected, a.month), digits)} {units.label}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
        <span className="cap">Hits company production</span>
        {a.hits.length === 0 ? (
          <span className="lbl">No focus company owns a share.</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {a.hits.map((h) => (
              <li
                key={h.companyId}
                className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]"
              >
                <Link to={`/companies/${h.companyId}`} className="link">
                  {h.companyName}
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
            Add note
          </button>
          <button type="button" className="btn" disabled={settled} onClick={onMarkExplained}>
            {settled ? `Marked ${status}` : 'Mark explained'}
          </button>
        </div>
        {writing ? (
          <form id={noteId} onSubmit={save} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Note for {a.fieldName}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="input min-h-[64px] resize-y py-2 text-[13px]"
              />
            </label>
            <button type="submit" className="btn self-start" disabled={!draft.trim()}>
              Save note
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
