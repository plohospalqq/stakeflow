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
import { AnswerCard } from './ask/AnswerCard';

interface Turn {
  id: number;
  question: string;
}

/** Ask (preview, behind VITE_FEATURE_ASK): a chat over the marts with canned answers for now. */
export default function Ask() {
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
      label={
        <span className="flex items-center gap-2">
          Ask the data <span className="chip px-1.5 text-[11px]">Beta</span>
        </span>
      }
      title="Ask the data"
    >
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 max-w-[900px] flex-[3_1_600px] flex-col gap-[18px]">
          <section aria-labelledby="conv-h" className="flex flex-col gap-[18px]">
            <h2 id="conv-h" className="sr-only">
              Conversation
            </h2>
            {turns.map((t, i) => (
              <div
                key={t.id}
                ref={i === turns.length - 1 ? lastTurn : undefined}
                className="flex scroll-mt-4 flex-col gap-3"
              >
                <p className="m-0 max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-surface3 px-4 py-3 text-[14px]">
                  <span className="sr-only">You asked: </span>
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
            className="flex items-end gap-2.5 rounded-[14px] border border-line-strong bg-surface py-2.5 pl-4 pr-2.5"
          >
            <label htmlFor={inputId} className="sr-only">
              Your question
            </label>
            <textarea
              id={inputId}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about fields, companies, owners or forecasts…"
              className="min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              aria-label="Send question"
              disabled={!draft.trim()}
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-control bg-ink text-bg disabled:opacity-40"
            >
              <Icon name="send" />
            </button>
          </form>
          <p className="lbl m-0">
            A preview: a few example questions have hand-written answers with sample numbers.
            Answers will come from the same public data as the rest of the site; always check the
            SQL before relying on one.
          </p>
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5" aria-label="Help">
          <section className="card flex flex-col gap-2.5 p-4" aria-labelledby="try-h">
            <h2 id="try-h" className="m-0 text-[14px] font-semibold">
              Good first questions
            </h2>
            {GOOD_FIRST_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="min-h-[40px] rounded-control border border-line-strong px-3 py-2 text-left text-[13px] hover:bg-surface2"
              >
                {q}
              </button>
            ))}
          </section>
          <section className="card flex flex-col gap-2.5 p-4" aria-labelledby="tb-h">
            <h2 id="tb-h" className="m-0 text-[14px] font-semibold">
              Data you can ask about
            </h2>
            <dl className="m-0 flex flex-col">
              {ASK_TABLES.map((t) => (
                <div key={t.name} className="flex flex-col gap-0.5 border-t border-line py-2">
                  <dt className="num break-all text-[12px]">{t.name}</dt>
                  <dd className="lbl m-0">{t.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </Page>
  );
}
