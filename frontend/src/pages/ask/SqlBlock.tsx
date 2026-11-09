import { useEffect, useId, useState } from 'react';
import type { AskAnswer } from '@/api/types';
import { Icon } from '@/components/Icon';
import { useI18n } from '@/i18n/useI18n';
import { downloadCsv, toCsv } from '@/lib/csv';
import { tokenizeSql, type SqlTokenKind } from '@/lib/sql';

const TOKEN_CLASS: Record<SqlTokenKind, string> = {
  keyword: 'font-semibold text-ink',
  string: 'text-up-ink',
  number: 'text-warn-ink',
  comment: 'italic text-muted',
  text: '',
};

type CopyState = 'idle' | 'copied' | 'failed';

/** Collapsible generated SQL with copy, edit-and-rerun and CSV of the result. */
export function SqlBlock({ answer }: { answer: AskAnswer }) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer.sql);
  const [rerunNote, setRerunNote] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');
  const panelId = useId();
  const editId = useId();

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = window.setTimeout(() => setCopy('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const copySql = () => {
    // Typed as always present, but missing outside secure contexts (plain http).
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) {
      setCopy('failed');
      return;
    }
    clipboard.writeText(answer.sql).then(
      () => setCopy('copied'),
      () => setCopy('failed'),
    );
  };

  const download = () =>
    downloadCsv(
      'stakeflow-ask-sample.csv',
      toCsv(
        answer.columns,
        answer.rows.map((r) => [...r]),
      ),
    );

  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full flex-wrap items-center gap-x-2.5 px-[18px] py-2 text-left text-[13px] font-medium hover:bg-surface2"
      >
        <Icon name="chevron-right" className={open ? 'rotate-90' : ''} />
        <span className="flex-1">{m.ask.sql}</span>
        <span className="lbl">{m.ask.sqlSub}</span>
      </button>
      {open ? (
        <div id={panelId}>
          {editing ? (
            <div className="flex flex-col gap-2 px-[18px] pb-3">
              <label htmlFor={editId} className="lbl">
                {m.ask.editQuery}
              </label>
              <textarea
                id={editId}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(16, draft.split('\n').length + 1)}
                spellCheck={false}
                className="mono w-full resize-y rounded-2xl border border-line bg-surface2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink"
              />
            </div>
          ) : (
            <pre className="mono m-0 overflow-x-auto bg-surface2 px-5 py-3.5 text-[12.5px] leading-relaxed">
              <code>
                {tokenizeSql(answer.sql).map((t, i) => (
                  <span key={i} className={TOKEN_CLASS[t.kind]}>
                    {t.text}
                  </span>
                ))}
              </code>
            </pre>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-[18px] pb-3.5 pt-2.5">
            <button type="button" className="btn" onClick={copySql}>
              <Icon name={copy === 'copied' ? 'check' : 'copy'} />
              {copy === 'copied' ? m.ask.copied : m.ask.copy}
            </button>
            {editing ? (
              <button type="button" className="btn" onClick={() => setRerunNote(true)}>
                <Icon name="play" />
                {m.ask.run}
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                <Icon name="edit" />
                {m.ask.edit}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={download}
              disabled={answer.rows.length === 0}
            >
              <Icon name="download" />
              {m.common.downloadCsv}
            </button>
            <span className="lbl" role="status">
              {copy === 'failed' ? m.ask.copyBlocked : ''}
            </span>
          </div>
          {rerunNote ? (
            <p className="lbl m-0 px-5 pb-4" role="status">
              {m.ask.rerunNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
