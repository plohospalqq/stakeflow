import { Link } from 'react-router';
import { isSample } from '@/api/mode';
import type { FieldDetail as Field, FieldForecast, FieldMonthly } from '@/api/types';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useUnits } from '@/hooks/useUnits';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';
import { formatMonth, formatNumber, formatPct, formatUtc } from '@/lib/format';
import type { Plateau } from '@/lib/fieldStats';
import type { LatestView } from '@/lib/latest';

/** Model card numbers can be missing (no curve, too little history): a dash, never "NaN". */
const orDash = (value: number | null, format: (v: number) => string) =>
  value === null ? '–' : format(value);

export function ForecastExplainer({
  forecast,
  history,
  missing,
}: {
  forecast: FieldForecast | undefined;
  history: FieldMonthly[];
  /** The field has no model card (nothing produced in the last two years). */
  missing: boolean;
}) {
  const { m, t } = useI18n();
  const units = useUnits();
  const model = forecast?.model;
  const status = model?.status ?? 'arps';
  const next12 = forecast?.points.slice(1, 13) ?? [];
  const last12 = history.slice(-12);
  const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const nextAvg = avg(next12.map((p) => units.fromMonth(p.p50, p.month)));
  const lastAvg = avg(last12.map((h) => units.fromMonth(h.oeSm3, h.month)));
  const curve = status === 'arps';
  const howText =
    status === 'arps' || status === 'shut_down' ? m.field.how1 : m.field.howFlat[status];

  return (
    <aside className="card enter flex min-w-0 flex-col gap-3.5 p-5" aria-labelledby="hw-h">
      <h2 id="hw-h" className="display m-0 text-h2 font-semibold">
        {m.field.howTitle}
      </h2>
      {missing || status === 'shut_down' ? (
        <p className="m-0 text-[14px] text-muted">{m.field.noForecastText}</p>
      ) : (
        <>
          <p className="m-0 text-[14px] text-muted">
            <Rich
              text={howText}
              strong={(c, k) => (
                <Term key={k} id={curve ? 'decline' : 'plateau'}>
                  <strong className="font-semibold text-ink">{c}</strong>
                </Term>
              )}
            />
          </p>
          <p className="m-0 text-[14px] text-muted">
            <Rich text={m.field.how2} />
          </p>
        </>
      )}
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className="flex items-center gap-2">
          <span className="cap">{m.field.model}</span>
          {isSample('forecast') ? <SampleBadge detail={m.sample.forecast} /> : null}
        </span>
        {model ? (
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>{m.field.method}</dt>
            <dd>{m.field.methodBy[status]}</dd>
            {curve ? (
              <>
                <dt>{m.field.bFactor}</dt>
                <dd className="num">{orDash(model.b, (v) => formatNumber(v, 2))}</dd>
                <dt>{m.field.initialDecline}</dt>
                <dd className="num">
                  {orDash(model.initialDeclinePctPerYear, (v) =>
                    t(m.field.perYear, { v: formatNumber(v, 1) }),
                  )}
                </dd>
                <dt>{m.field.fittedOn}</dt>
                <dd>
                  {model.fitWindow
                    ? `${formatMonth(model.fitWindow.start)} – ${formatMonth(model.fitWindow.end)}`
                    : '–'}
                </dd>
              </>
            ) : null}
            <dt>{m.field.backtest}</dt>
            <dd className="num">{orDash(model.backtestErrorPct, (v) => formatPct(v, 1))}</dd>
            <dt>{m.field.naive}</dt>
            <dd className="num">{orDash(model.naiveErrorPct, (v) => formatPct(v, 1))}</dd>
            <dt>
              <Term id="range80">{m.field.coverage}</Term>
            </dt>
            <dd className="num">{orDash(model.backtestCoveragePct, (v) => formatPct(v, 0))}</dd>
            <dt>{m.field.dataThrough}</dt>
            <dd className="num">{formatMonth(model.dataThrough)}</dd>
            <dt>{m.field.modelRun}</dt>
            <dd className="num">{formatUtc(model.runAt)}</dd>
          </dl>
        ) : missing ? (
          <p className="m-0 text-[14px] text-muted">{m.field.noForecast}</p>
        ) : (
          <Skeleton height={120} />
        )}
        {model && model.backtestErrorPct !== null ? (
          <p className="lbl m-0">{m.field.backtestNote}</p>
        ) : null}
      </div>
      {next12.length > 0 && last12.length > 0 ? (
        <div className="rounded-2xl bg-surface2 px-4 py-3 text-[13px] text-muted">
          <Rich
            text={m.field.next12}
            vars={{
              value: units.format(nextAvg),
              unit: units.label,
              pct: formatPct(Math.abs((nextAvg / lastAvg - 1) * 100), 1),
              direction: nextAvg < lastAvg ? m.field.lower : m.field.higher,
            }}
          />
        </div>
      ) : null}
    </aside>
  );
}

export function FocusShareCard({ field }: { field: Field }) {
  const { m, t } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const latest = field.latest;
  const owners = FOCUS_ORDER.map((id) => ({
    id,
    share: field.currentOwners.filter((o) => o.groupId === id).reduce((s, o) => s + o.sharePct, 0),
  })).filter((o) => o.share > 0);
  const total = latest ? units.fromMonth(latest.oeSm3, latest.month) : 0;

  return (
    <div
      className="card enter col-span-2 flex min-w-0 flex-col gap-2 p-5 nav:col-span-1"
      style={{ '--i': 3 }}
    >
      <span className="text-[13px] font-semibold text-muted">
        <Term id="licenceShare">{m.field.focusShare}</Term>
      </span>
      {owners.length === 0 ? (
        <span className="text-[14px] text-muted">{m.field.focusNone}</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {owners.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-baseline justify-between gap-x-2 text-[14px]"
            >
              {/* Wrap, never truncate: "(NCS only)" in Equinor's name is a scope rule. */}
              <Link to={`/companies/${o.id}`} className="link min-w-0">
                {name(o.id)}
              </Link>
              <span className="flex flex-none items-baseline gap-1.5">
                <span className="display num text-[19px] font-semibold">
                  {units.format((total * o.share) / 100)}
                </span>
                <span className="lbl num">{formatNumber(o.share, 2)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <span className="lbl mt-auto">{t(m.field.focusFoot, { unit: units.label })}</span>
    </div>
  );
}

/** "What it means" for a field: age, peak, last year, why it declines, who owns it. */
export function FieldPlainWords({
  field,
  view,
  plateauStats,
  latestMonth,
}: {
  field: Field;
  view: LatestView | null;
  plateauStats: Plateau | null;
  latestMonth: string | undefined;
}) {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const first = field.firstProductionMonth;
  const age =
    first && latestMonth ? Number(latestMonth.slice(0, 4)) - Number(first.slice(0, 4)) : null;
  const state = field.currentOwners
    .filter((o) => o.groupId === 'petoro')
    .reduce((s, o) => s + o.sharePct, 0);
  const owners = new Set(field.currentOwners.map((o) => o.groupId)).size;
  const peakYears = plateauStats
    ? plateauStats.fromYear === plateauStats.toYear
      ? String(plateauStats.fromYear)
      : `${plateauStats.fromYear}–${plateauStats.toYear}`
    : '';
  const lines = [
    first && age !== null
      ? t(m.plain.fieldAge, { year: first.slice(0, 4), years: plural(m.common.years, age) })
      : null,
    plateauStats && view && view.value < plateauStats.value
      ? t(m.plain.fieldPeak, {
          peak: units.format(plateauStats.value),
          unit: units.label,
          years: peakYears,
          pct: formatPct((1 - view.value / plateauStats.value) * 100, 0),
        })
      : null,
    view?.yoyPct != null
      ? t(m.plain.fieldYoy, {
          pct: formatPct(Math.abs(view.yoyPct), 0),
          direction: view.yoyPct >= 0 ? m.plain.more : m.plain.less,
        })
      : null,
    m.plain.fieldWhy,
    state > 0
      ? t(m.plain.fieldOwners, { n: owners, share: `${formatNumber(state, 1)}%` })
      : t(m.plain.fieldOwnersNoState, { n: owners }),
  ].filter((l): l is string => Boolean(l));

  return (
    <section aria-labelledby="fplain-h" className="card enter flex flex-col gap-3 p-6">
      <h2 id="fplain-h" className="m-0 text-[13px] font-semibold text-muted">
        {m.common.whatItMeans}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[16px] leading-[1.45]">
        {lines.map((line, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-2.5">
            <span
              className="display num flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{
                background: ['var(--oil)', 'var(--gas)', 'var(--cnd)', 'var(--fa)', 'var(--fa)'][i],
              }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="lbl m-0">
        <Term id="plateau" /> · <Term id="decline" /> · <Term id="state" />
      </p>
    </section>
  );
}
