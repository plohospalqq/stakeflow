import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAsk } from '@/api/hooks';
import type { AskAnswer, AskPreviewReason } from '@/api/types';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { useI18n } from '@/i18n/useI18n';
import { formatNumber } from '@/lib/format';
import { AskBars } from './AskBars';
import { SqlBlock } from './SqlBlock';

type View = 'chart' | 'table';

/** Why a prepared example answered instead of the AI. */
const PREVIEW_NOTE = {
  aiOff: 'previewAiOff',
  unavailable: 'previewUnavailable',
  offline: 'previewOffline',
} as const satisfies Record<AskPreviewReason, string>;
const VIEWS: View[] = ['chart', 'table'];

type Row = AskAnswer['rows'][number];

function ResultTable({ answer }: { answer: AskAnswer }) {
  const { m, t } = useI18n();
  const columns: Column<Row>[] = answer.columns.map((header, i) => {
    // SQL NULLs do not decide the column type; they print as a dash.
    const numeric = answer.rows.every((r) => typeof r[i] === 'number' || r[i] === null);
    return {
      id: String(i),
      header,
      align: numeric ? 'right' : 'left',
      value: (r) => r[i] ?? null,
      cell: (r) => {
        const v = r[i];
        if (v === null || v === undefined) return '–';
        return typeof v === 'number' ? formatNumber(v, 1) : v;
      },
    };
  });
  return (
    <div className="px-1.5 pb-2">
      <DataTable
        caption={t(m.ask.resultOf, { q: answer.question })}
        columns={columns}
        rows={answer.rows}
        // A real query can repeat its first column (one row per year and field), so the whole
        // row is the key.
        rowKey={(r) => JSON.stringify(r)}
        dense
      />
    </div>
  );
}

/** Chart and Table as real tabs: arrow keys move between them, Tab goes into the panel. */
function ResultTabs({ answer }: { answer: AskAnswer }) {
  const { m } = useI18n();
  const [view, setView] = useState<View>('chart');
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
    const target = VIEWS[next];
    if (!target) return;
    setView(target);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] pb-2.5">
        <div
          role="tablist"
          aria-label={m.ask.resultView}
          className="inline-flex gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--tx)_7%,transparent)] p-[3px]"
        >
          {VIEWS.map((v, i) => {
            const on = view === v;
            return (
              <button
                key={v}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-${v}-tab`}
                aria-selected={on}
                aria-controls={`${base}-${v}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setView(v)}
                onKeyDown={(e) => onKey(e, i)}
                className={`inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[13px] font-medium max-nav:min-h-[44px] ${
                  on
                    ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.14)] [.t-dark_&]:bg-surface3'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'chart' ? m.ask.chart : m.ask.table}
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
  const { m, t } = useI18n();
  const ask = useAsk(question);
  const answer = ask.data;

  // onReady is stable (the page memoises it), so this runs once per answer.
  useEffect(() => {
    if (answer) onReady(answer);
  }, [answer, onReady]);

  if (ask.isError) {
    return <ErrorState message={m.ask.failed} onRetry={() => void ask.refetch()} />;
  }

  return (
    <article
      className="card enter flex min-w-0 flex-col overflow-hidden"
      aria-label={t(m.ask.answerTo, { q: question })}
    >
      {!answer ? (
        <div className="flex flex-col gap-2.5 p-[18px]" aria-busy="true">
          <span className="lbl">{m.ask.working}</span>
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
              {answer.preview ? <SampleBadge detail={m.sample.ask} /> : null}
            </div>
            {answer.preview ? (
              <p className="m-0 flex items-start gap-1.5 text-[13px] text-muted">
                <Icon name="info" size={14} className="mt-0.5 flex-none text-warn-ink" />
                {m.ask[PREVIEW_NOTE[answer.preview]]}
              </p>
            ) : null}
            <p lang="en" className="m-0 text-[16px] leading-relaxed">
              {answer.answer}
            </p>
          </div>
          {answer.matched && answer.chart.length > 0 ? <ResultTabs answer={answer} /> : null}
          {answer.sql ? <SqlBlock answer={answer} /> : null}
        </>
      )}
      {answer && answer.followUps.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line px-[18px] py-3.5">
          <span className="cap">{answer.matched ? m.ask.followUps : m.ask.tryThese}</span>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.map((f) => (
              <button
                key={f}
                type="button"
                lang="en"
                className="min-h-[40px] rounded-full bg-surface2 px-3.5 text-left text-[14px] hover:bg-surface3 max-nav:min-h-[44px]"
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
