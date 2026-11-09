import type { ScenarioModel } from '@/api/types.scenario';
import { Rings } from '@/components/Rings';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth, formatNumber, formatPct } from '@/lib/format';
import { DRIVERS } from '@/lib/scenario';

/** The model's fit, window and coefficients, always on screen next to its answer. */
export function ModelFit({ model }: { model: ScenarioModel | undefined }) {
  const { m, t, plural } = useI18n();
  return (
    <section aria-labelledby="fit-h" className="card enter flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fit-h" className="display m-0 text-h2 font-semibold">
          {m.scenarios.fit}
        </h2>
        <SampleBadge detail={m.sample.scenario} />
      </div>
      {!model ? (
        <Skeleton height={220} />
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
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>{m.scenarios.window}</dt>
            <dd className="num">
              {formatMonth(model.window.start)} – {formatMonth(model.window.end)}
            </dd>
            <dt>{m.scenarios.observations}</dt>
            <dd className="num">{plural(m.scenarios.observationsValue, model.observations)}</dd>
            <dt>{m.scenarios.uncertainty}</dt>
            <dd className="num">
              ±
              {t(m.scenarios.perYear, {
                v: formatPct(model.residualVolMonthly * Math.sqrt(12) * 100, 0),
              })}
            </dd>
          </dl>
          <p className="m-0 text-[13px] text-muted">
            <span className="font-semibold text-ink">{m.scenarios.method}: </span>
            {m.scenarios.methodText}
          </p>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="cap">{m.scenarios.coefficients}</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
              {DRIVERS.map((d) => (
                <li key={d} className="flex justify-between gap-3">
                  <span>{m.scenarios.drivers[d]}</span>
                  <span className="num">
                    {formatNumber(model.coefficients[d], 2)}{' '}
                    <span className="text-muted">± {formatNumber(model.standardErrors[d], 2)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <span className="lbl">{m.scenarios.coefficientsNote}</span>
          </div>
        </>
      )}
    </section>
  );
}
