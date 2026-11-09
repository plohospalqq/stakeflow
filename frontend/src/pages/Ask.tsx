import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ASK_TABLES, GOOD_FIRST_QUESTIONS } from '@/api/mock/ask';
import type { AskAnswer } from '@/api/types';
import { Icon } from '@/components/Icon';
import { Page } from '@/components/layout/Page';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { AnswerCard } from './ask/AnswerCard';

interface Turn {
  id: number;
  question: string;
}

/** Ask (preview, behind VITE_FEATURE_ASK): a chat over the marts with canned answers for now. */
export default function Ask() {
  const { m } = useI18n();
  const [turns, setTurns] = useState<Turn[]>(() => [
    { id: 0, question: GOOD_FIRST_QUESTIONS[0] ?? 'Top 10 gas fields in 2025' },
  ]);
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const lastTurn = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;
    setTurns((t) => [...t, { id: (t[t.length - 1]?.id ?? 0) + 1, question: q }]);
  }, []);

  const onReady = useCallback((answer: AskAnswer) => setAnnouncement(answer.answer), []);

  // Bring a new question into view, but not the example that is there on arrival.
  useEffect(() => {
    if (turns.length > 1) {
      lastTurn.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [turns.length, reduceMotion]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
    setDraft('');
  };

  // Enter sends, Shift+Enter makes a new line, like most chat inputs.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
      setDraft('');
    }
  };

  return (
    <Page
      hideFreshness
      label={
        <span className="flex items-center gap-2">
          {m.nav.ask}{' '}
          <span className="rounded-full bg-surface3 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]">
            {m.nav.beta}
          </span>
        </span>
      }
      title={m.ask.title}
    >
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 max-w-[900px] flex-[3_1_600px] flex-col gap-[18px]">
          <section aria-labelledby="conv-h" className="flex flex-col gap-[18px]">
            <h2 id="conv-h" className="sr-only">
              {m.ask.conversation}
            </h2>
            {turns.map((t, i) => (
              <div
                key={t.id}
                ref={i === turns.length - 1 ? lastTurn : undefined}
                className="flex scroll-mt-4 flex-col gap-3"
              >
                <p className="m-0 max-w-[80%] self-end rounded-[22px_22px_6px_22px] bg-ink px-4 py-3 text-[15px] text-bg">
                  <span className="sr-only">{m.ask.youAsked}</span>
                  {t.question}
                </p>
                <AnswerCard question={t.question} onAsk={ask} onReady={onReady} />
              </div>
            ))}
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </section>

          <form
            onSubmit={submit}
            className="glass flex items-end gap-2.5 rounded-[26px] py-2.5 pl-5 pr-2.5 shadow-none"
          >
            <label htmlFor={inputId} className="sr-only">
              {m.ask.question}
            </label>
            <textarea
              id={inputId}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={m.ask.placeholder}
              className="min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              aria-label={m.ask.send}
              disabled={!draft.trim()}
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-ink text-bg disabled:opacity-40"
            >
              <Icon name="send" />
            </button>
          </form>
          <p className="lbl m-0">{m.ask.foot}</p>
          <p className="lbl m-0">{m.ask.examplesNote}</p>
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4" aria-label={m.ask.help}>
          <section className="card flex flex-col gap-2.5 p-5" aria-labelledby="try-h">
            <h2 id="try-h" className="display m-0 text-h2 font-semibold">
              {m.ask.goodFirst}
            </h2>
            {GOOD_FIRST_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                lang="en"
                className="min-h-[44px] rounded-2xl bg-surface2 px-3.5 py-2.5 text-left text-[14px] hover:bg-surface3"
              >
                {q}
              </button>
            ))}
          </section>
          <section className="card flex flex-col gap-2.5 p-5" aria-labelledby="tb-h">
            <h2 id="tb-h" className="display m-0 text-h2 font-semibold">
              {m.ask.tables}
            </h2>
            <dl className="m-0 flex flex-col">
              {ASK_TABLES.map((t) => (
                <div key={t.name} className="flex flex-col gap-0.5 border-t border-line py-2">
                  <dt className="mono break-all text-[12px]">{t.name}</dt>
                  <dd lang="en" className="lbl m-0">
                    {t.description}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </Page>
  );
}
