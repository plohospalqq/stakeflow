import { Link } from 'react-router';
import { useScenario } from '@/api/hooks';
import { SampleBadge } from '@/components/SampleBadge';
import { ScenarioGauge } from '@/components/ScenarioGauge';
import { Skeleton } from '@/components/Skeleton';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { formatPct } from '@/lib/format';
import { NEUTRAL_SCENARIO } from '@/lib/scenario';
import { PRESETS } from '../scenarios/presets';

const TEASER_COMPANY = 'aker-bp';
const OIL_DOWN = { ...NEUTRAL_SCENARIO, brentChangePct: -30 };

/** "What if oil falls 30%?": a taste of the scenario explorer, clearly a scenario. */
export function ScenarioTeaser() {
  const { m, t } = useI18n();
  const name = useCompanyName();
  const scenario = useScenario(TEASER_COMPANY, OIL_DOWN);
  const r = scenario.data;

  return (
    <section aria-labelledby="scen-h" className="flex flex-col items-center gap-4 py-16 nav:py-20">
      <h2 id="scen-h" className="display m-0 text-center text-display-xl font-bold">
        {m.home.scenarioTitle}
      </h2>
      <div className="card mt-8 grid w-full max-w-[1000px] items-center gap-10 overflow-hidden rounded-[32px] p-7 nav:grid-cols-[1.1fr_1fr] nav:p-10 [.t-dark_&]:bg-[radial-gradient(120%_140%_at_0%_0%,#1c1c1e_0%,#0b0b0c_60%)]">
        <div className="flex flex-col gap-4">
          <p className="display m-0 text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">
            {m.home.scenarioHook}
            <br />
            <span className="text-muted">{m.home.scenarioHookDim}</span>
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {PRESETS.slice(0, 4).map((p, i) => (
              <li key={p.id}>
                <Link
                  to={`/scenarios?preset=${p.id}`}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-[15px] font-medium no-underline transition-transform duration-300 hover:scale-[1.04] ${
                    i === 0 ? 'bg-ink text-bg' : 'bg-surface2 text-ink'
                  }`}
                >
                  {m.scenarios[p.label]}
                </Link>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[15px] text-muted">{m.home.scenarioText}</p>
          <Link to="/scenarios" className="btn btn-primary self-start">
            {m.home.scenarioCta}
          </Link>
        </div>
        <div className="flex flex-col items-center gap-3">
          {r ? (
            <>
              <ScenarioGauge medianPct={r.medianPct} lowPct={r.lowPct} highPct={r.highPct} />
              <p className="m-0 text-center text-[14px] text-muted">
                {t(m.home.scenarioResult, {
                  company: name(TEASER_COMPANY),
                  lo: formatPct(r.lowPct, 0, true),
                  hi: formatPct(r.highPct, 0, true),
                })}
              </p>
            </>
          ) : (
            <Skeleton width={240} height={140} />
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--oil)_50%,transparent)] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-oil-ink">
              {m.scenarios.notice}
            </span>
            <SampleBadge detail={m.sample.scenario} />
          </div>
        </div>
      </div>
    </section>
  );
}
