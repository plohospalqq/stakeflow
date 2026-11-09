import { useId, useState, type FormEvent } from 'react';
import { useLatestPrices, useParseScenario } from '@/api/hooks';
import { ApiError } from '@/api/http';
import type { ParseContext, ParsedScenario } from '@/api/types.scenario';
import { Icon } from '@/components/Icon';
import { useI18n } from '@/i18n/useI18n';
import { describeParsed } from './describe';

/**
 * Free text → the five numbers. Only the translation is done by AI on the backend; the
 * model computes the result, and every number lands on the sliders where it can be changed.
 * The parser gets today's price levels, so "oil at $90" becomes a percentage it can show.
 * A 503 means the backend has no AI configured: say so and point to the presets.
 */
export function WriteYourOwn({
  companyId,
  onApply,
}: {
  companyId: string;
  onApply: (parsed: ParsedScenario) => void;
}) {
  const { m, t, plural } = useI18n();
  const [text, setText] = useState('');
  const parse = useParseScenario();
  const latest = useLatestPrices();
  const id = useId();
  const statusId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    const prices = latest.data;
    const context: ParseContext = {
      companyId,
      reference: prices
        ? { brentUsd: prices.brentUsdPerBbl, ttfEurMwh: prices.ttfEurPerMwh, eurusd: prices.eurUsd }
        : null,
    };
    parse.mutate(
      { text: q, context },
      {
        onSuccess: (parsed) => {
          if (parsed.recognised.length > 0) onApply(parsed);
        },
      },
    );
  };

  let status: { tone: 'ok' | 'warn' | 'error'; text: string } | null = null;
  if (parse.isError) {
    status =
      parse.error instanceof ApiError && parse.error.status === 503
        ? {
            tone: 'warn',
            text:
              parse.error.code === 'llm_not_configured' ? m.scenarios.aiOff : m.scenarios.aiDown,
          }
        : parse.error instanceof ApiError && parse.error.status === 422
          ? { tone: 'warn', text: m.scenarios.writeNothing }
          : { tone: 'error', text: m.scenarios.writeFailed };
  } else if (parse.data) {
    status =
      parse.data.recognised.length === 0
        ? { tone: 'warn', text: m.scenarios.writeNothing }
        : {
            tone: 'ok',
            text: `${t(m.scenarios.writeUnderstood, {
              summary: describeParsed(parse.data, m, (n) => plural(m.scenarios.horizonValue, n)),
            })} ${m.scenarios.applied}`,
          };
  }

  return (
    <section aria-labelledby={`${id}-h`} className="card enter flex flex-col gap-3 p-5">
      <h2 id={`${id}-h`} className="display m-0 flex items-center gap-2 text-h2 font-semibold">
        <Icon name="sparkle" />
        {m.scenarios.writeTitle}
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={id} className="sr-only">
          {m.scenarios.writeLabel}
        </label>
        <textarea
          id={id}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={m.scenarios.writePlaceholder}
          aria-describedby={statusId}
          className="min-h-[88px] w-full resize-y rounded-2xl border border-line bg-surface2 px-4 py-3 text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          className="btn btn-primary self-start"
          disabled={!text.trim() || parse.isPending}
        >
          {m.scenarios.writeCta}
        </button>
      </form>
      <p
        id={statusId}
        role="status"
        className={`m-0 text-[14px] ${
          status?.tone === 'ok'
            ? 'text-up-ink'
            : status?.tone === 'warn'
              ? 'text-warn-ink'
              : status?.tone === 'error'
                ? 'text-down-ink'
                : 'text-muted'
        }`}
      >
        {status ? status.text : m.scenarios.writeNote}
      </p>
      {parse.data && parse.data.assumptions.length > 0 && !parse.isError ? (
        <div className="flex flex-col gap-1">
          <span className="cap">{m.scenarios.howWorkedOut}</span>
          <ul lang="en" className="lbl m-0 flex list-disc flex-col gap-1 pl-4">
            {parse.data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
