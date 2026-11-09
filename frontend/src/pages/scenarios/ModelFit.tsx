import { IS_STATIC_DEMO, isSample } from '@/api/mode';
import type { ScenarioModel } from '@/api/types.scenario';
import { Rings } from '@/components/Rings';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth, formatNumber, formatPct, formatShare, formatUtc } from '@/lib/format';
import { DRIVERS, isSignificant } from '@/lib/scenario';

/** The model's fit, window, coefficients and backtest, always on screen next to its answer. */
export function ModelFit({ model, failed }: { model: ScenarioModel | undefined; failed: boolean }) {
  const { m, t, plural } = useI18n();
  const backtest = model?.backtest;
  return (
    <section aria-labelledby="fit-h" className="card enter flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fit-h" className="display m-0 text-h2 font-semibold">
          {m.scenarios.fit}
        </h2>
        {isSample('scenario') ? (
          <SampleBadge detail={IS_STATIC_DEMO ? m.sample.scenarioStatic : m.sample.scenario} />
        ) : null}
      </div>
      {!model ? (
        failed ? (
          <p className="m-0 text-[14px] text-muted">{m.scenarios.noModelFit}</p>
        ) : (
          <Skeleton height={220} />
        )
      ) : (
        <>
          <div className="flex items-center gap-5">
            <Rings
              size={96}
              stroke={12}
              label={`R² ${formatNumber(model.rSquared, 2)}`}
              rings={[{ key: 'r2', value: model.rSquared, color: 'var(--fc)' }]}
            />
            <div className="flex flex-col">
              <span className="display num text-[34px] font-bold leading-none tracking-[-0.04em]">
                {formatNumber(model.rSquared, 2)}
              </span>
              <span className="text-[14px] text-muted">
                <Term id="rSquared">{m.scenarios.rSquared}</Term>
              </span>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            {model.adjRSquared !== null ? (
              <>
                <dt>{m.scenarios.adjRSquared}</dt>
                <dd className="num">{formatNumber(model.adjRSquared, 2)}</dd>
              </>
            ) : null}
            <dt>{m.scenarios.window}</dt>
            <dd className="num">
              {formatMonth(model.window.start)} – {formatMonth(model.window.end)}
            </dd>
            <dt>{m.scenarios.observations}</dt>
            <dd className="num">{plural(m.scenarios.observationsValue, model.observations)}</dd>
            <dt>{m.scenarios.uncertainty}</dt>
            <dd className="num">
              ±{t(m.scenarios.perMonth, { v: formatPct(model.residualVolMonthly * 100, 1) })}
            </dd>
            <dt>{m.scenarios.modelRun}</dt>
            <dd className="num">{formatUtc(model.runAt)}</dd>
          </dl>
          <p className="m-0 text-[13px] text-muted">
            <span className="font-semibold text-ink">{m.scenarios.method}: </span>
            {model.methodText ? <span lang="en">{model.methodText}</span> : m.scenarios.methodText}
          </p>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="cap">{m.scenarios.coefficients}</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
              {DRIVERS.map((d) => (
                <li key={d} className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    {m.scenarios.drivers[d]}
                    {isSignificant(model, d) ? null : (
                      <span className="lbl"> · {m.scenarios.notSignificant}</span>
                    )}
                  </span>
                  <span className="num">
                    {formatNumber(model.coefficients[d], 2)}{' '}
                    <span className="text-muted">± {formatNumber(model.standardErrors[d], 2)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <span className="lbl">{m.scenarios.coefficientsNote}</span>
          </div>
          {model.excludedMonths.length > 0 ? (
            <p className="lbl m-0">
              {t(m.scenarios.excluded, {
                months: model.excludedMonths.map((x) => formatMonth(x.month)).join(', '),
              })}
            </p>
          ) : null}
          {backtest ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className="cap">
                <Term id="backtest">{m.scenarios.backtest}</Term>
              </span>
              <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
                <dt>{m.scenarios.quartersScored}</dt>
                <dd className="num">{backtest.quartersScored}</dd>
                <dt>{m.scenarios.r2InSample}</dt>
                <dd className="num">
                  {backtest.rSquaredInSample === null
                    ? '–'
                    : formatNumber(backtest.rSquaredInSample, 2)}
                </dd>
                <dt>{m.scenarios.r2OutOfSample}</dt>
                <dd className="num">
                  {backtest.rSquaredOutOfSample === null
                    ? '–'
                    : formatNumber(backtest.rSquaredOutOfSample, 2)}
                </dd>
                <dt>{m.scenarios.bandCoverage}</dt>
                <dd className="num">
                  {backtest.bandCoverage80 === null ? '–' : formatShare(backtest.bandCoverage80)}
                </dd>
              </dl>
              <p lang="en" className="lbl m-0">
                {backtest.note}
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
