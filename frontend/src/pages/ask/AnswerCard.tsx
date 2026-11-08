import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAsk } from '@/api/hooks';
import type { AskAnswer } from '@/api/types';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { formatNumber } from '@/lib/format';
import { AskBars } from './AskBars';
import { SqlBlock } from './SqlBlock';

type View = 'chart' | 'table';
const VIEWS: { value: View; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
];

function ResultTable({ answer }: { answer: AskAnswer }) {
  const columns: Column<(string | number)[]>[] = answer.columns.map((header, i) => {
    const numeric = answer.rows.every((r) => typeof r[i] === 'number');
    return {
      id: String(i),
      header,
      align: numeric ? 'right' : 'left',
      value: (r) => r[i] ?? null,
      cell: (r) => {
        const v = r[i];
        return typeof v === 'number' ? formatNumber(v, 1) : v;
      },
    };
  });
  return (
    <div className="px-1.5 pb-2">
      <DataTable
        caption={`Result of: ${answer.question}`}
        columns={columns}
        rows={answer.rows}
        rowKey={(r) => String(r[0])}
        dense
      />
    </div>
  );
}

/** Chart and Table as real tabs: arrow keys move between them, Tab goes into the panel. */
function ResultTabs({ answer }: { answer: AskAnswer }) {
  const [view, setView] = useState<View>('chart');
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
    const target = VIEWS[next];
    if (!target) return;
    setView(target.value);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] pb-2.5">
        <div
          role="tablist"
          aria-label="Result view"
          className="inline-flex gap-0.5 rounded-control border border-line bg-surface2 p-[3px]"
        >
          {VIEWS.map((v, i) => {
            const on = view === v.value;
            return (
              <button
                key={v.value}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-${v.value}-tab`}
                aria-selected={on}
                aria-controls={`${base}-${v.value}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setView(v.value)}
                onKeyDown={(e) => onKey(e, i)}
                className={`inline-flex min-h-[34px] items-center rounded-[7px] px-3 text-[12.5px] font-medium max-nav:min-h-[40px] ${
                  on ? 'bg-surface3 text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        {view === 'chart' ? (
          <span className="flex flex-wrap gap-3.5 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="dot bg-forecast" aria-hidden="true" />
              {answer.chartLegend.current}
            </span>
            {answer.chartLegend.previous ? (
              <span className="flex items-center gap-1.5">
                <span className="dot bg-field-4" aria-hidden="true" />
                {answer.chartLegend.previous}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <div role="tabpanel" id={`${base}-${view}-panel`} aria-labelledby={`${base}-${view}-tab`}>
        {view === 'chart' ? <AskBars answer={answer} /> : <ResultTable answer={answer} />}
      </div>
    </>
  );
}

export function AnswerCard({
  question,
  onAsk,
  onReady,
}: {
  question: string;
  onAsk: (question: string) => void;
  /** Told when the answer has arrived, for the page's live region. Must be stable. */
  onReady: (answer: AskAnswer) => void;
}) {
  const ask = useAsk(question);
  const answer = ask.data;

  // onReady is stable (the page memoises it), so this runs once per answer.
  useEffect(() => {
    if (answer) onReady(answer);
  }, [answer, onReady]);

  if (ask.isError) {
    return (
      <ErrorState
        message="This question could not be answered."
        onRetry={() => void ask.refetch()}
      />
    );
  }

  return (
    <article
      className="card flex min-w-0 flex-col overflow-hidden"
      aria-label={`Answer to: ${question}`}
    >
      {!answer ? (
        <div className="flex flex-col gap-2.5 p-[18px]" aria-busy="true">
          <span className="lbl">Working on it…</span>
          <Skeleton width="70%" />
          <Skeleton height={40} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 px-[18px] py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <ol className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 text-[12px] text-muted">
                {answer.steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <Icon
                      name={answer.matched ? 'check' : 'info'}
                      size={14}
                      className={answer.matched ? 'text-up' : ''}
                    />
                    <span>
                      <span className="text-ink">{s.label}</span> · {s.detail}
                    </span>
                  </li>
                ))}
              </ol>
              <SampleBadge detail="Ask is a preview: a few example questions have hand-written answers with sample numbers" />
            </div>
            <p className="m-0 text-[15px] leading-relaxed">{answer.answer}</p>
          </div>
          {answer.matched && answer.chart.length > 0 ? <ResultTabs answer={answer} /> : null}
          {answer.sql ? <SqlBlock answer={answer} /> : null}
        </>
      )}
      {answer && answer.followUps.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line px-[18px] py-3.5">
          <span className="cap">{answer.matched ? 'Follow-up ideas' : 'Try one of these'}</span>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.map((f) => (
              <button
                key={f}
                type="button"
                className="min-h-[36px] rounded-full border border-line-strong px-3 text-left text-[13px] hover:bg-surface2 max-nav:min-h-[44px]"
                onClick={() => onAsk(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
