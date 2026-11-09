import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCompanyFields, useFreshness, useScenario, useScenarioModel } from '@/api/hooks';
import type { ParsedScenario, ScenarioParams } from '@/api/types.scenario';
import { Icon } from '@/components/Icon';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { ScenarioGauge } from '@/components/ScenarioGauge';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useDebounced } from '@/hooks/useDebounced';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth, formatPct, formatSigned } from '@/lib/format';
import { clampScenario, DRIVERS, NEUTRAL_SCENARIO, SCENARIO_LIMITS } from '@/lib/scenario';
import { ModelFit } from './scenarios/ModelFit';
import { isPresetId, PRESETS, SCENARIO_COMPANIES, type PresetId } from './scenarios/presets';
import { ScenarioSlider } from './scenarios/ScenarioSlider';
import { SharePriceCard } from './scenarios/SharePriceCard';
import { WriteYourOwn } from './scenarios/WriteYourOwn';

const SVERDRUP = 26376286;
const OIL_DOWN: ScenarioParams = { ...NEUTRAL_SCENARIO, brentChangePct: -30 };

/** Johan Sverdrup's share of the company's output in the latest month (0 if none). */
function useSverdrupShare(companyId: string): { share: number; month: string | undefined } {
  const freshness = useFreshness();
  const month = freshness.data?.latestMonth;
  const rows = useCompanyFields(companyId, month ? { start: month } : undefined);
  const latest = (rows.data ?? []).filter((r) => r.month === month);
  const total = latest.reduce((s, r) => s + r.oeSm3, 0);
  const sverdrup = latest.filter((r) => r.fieldId === SVERDRUP).reduce((s, r) => s + r.oeSm3, 0);
  return { share: total > 0 ? sverdrup / total : 0, month };
}

/** ?co= and ?preset= keep the explorer shareable. */
function useScenarioUrl(): [string, (id: string) => void, PresetId | null] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('co');
  const company = raw && SCENARIO_COMPANIES.includes(raw) ? raw : 'aker-bp';
  const preset = params.get('preset');
  const setCompany = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('co', id);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return [company, setCompany, isPresetId(preset) ? preset : null];
}

export default function Scenarios() {
  const { m, t, plural } = useI18n();
  const name = useCompanyName();
  const [company, setCompany, presetFromUrl] = useScenarioUrl();
  const sverdrup = useSverdrupShare(company);
  // Opens on "Oil −30%": a blank 0% says nothing about what the explorer does.
  const [params, setParams] = useState<ScenarioParams>(OIL_DOWN);
  const [active, setActive] = useState<PresetId | null>('oilDown');
  const settled = useDebounced(params, 120);
  const result = useScenario(company, settled);
  const model = useScenarioModel(company);

  // A preset in the link (from the landing page) applies once its inputs are known.
  const appliedFromUrl = useRef(false);
  useEffect(() => {
    if (appliedFromUrl.current || !presetFromUrl) return;
    const preset = PRESETS.find((p) => p.id === presetFromUrl);
    if (!preset || (preset.id === 'sverdrup' && !sverdrup.month)) return;
    appliedFromUrl.current = true;
    setParams(preset.params(sverdrup.share));
    setActive(preset.id);
  }, [presetFromUrl, sverdrup.share, sverdrup.month]);

  const set = (key: keyof ScenarioParams, value: number) => {
    setParams((p) => clampScenario({ ...p, [key]: value }));
    setActive(null);
  };
  const applyParsed = (parsed: ParsedScenario) => {
    setParams((p) => {
      const next = { ...p };
      for (const key of parsed.recognised) next[key] = parsed.params[key];
      return clampScenario(next);
    });
    setActive(null);
  };

  const companies = SCENARIO_COMPANIES.map((id) => ({ value: id, label: name(id) }));
  const pct = (v: number) => formatPct(v, 0, true);
  const spoken = (v: number) => t(m.scenarios.change, { v: formatPct(v, 0, true) });
  const r = result.data;
  const sliders: {
    key: keyof ScenarioParams;
    label: string;
    step: number;
    color?: string;
    text: (v: number) => string;
    spoken: (v: number) => string;
  }[] = [
    {
      key: 'brentChangePct',
      label: m.scenarios.brent,
      step: 1,
      color: 'var(--oil)',
      text: pct,
      spoken,
    },
    {
      key: 'ttfChangePct',
      label: m.scenarios.ttf,
      step: 1,
      color: 'var(--gas)',
      text: pct,
      spoken,
    },
    { key: 'productionChangePct', label: m.scenarios.production, step: 1, text: pct, spoken },
    { key: 'eurusdChangePct', label: m.scenarios.eurusd, step: 1, text: pct, spoken },
    {
      key: 'horizonMonths',
      label: m.scenarios.horizon,
      step: 1,
      text: (v) => plural(m.scenarios.horizonValue, v),
      spoken: (v) => plural(m.scenarios.horizonValue, v),
    },
  ];
  const maxContribution = useMemo(
    () => Math.max(1, ...DRIVERS.map((d) => Math.abs(r?.contributions[d] ?? 0))),
    [r],
  );

  return (
    <Page
      label={m.scenarios.label}
      title={m.scenarios.title}
      hideFreshness
      meta={<p className="m-0 max-w-[720px] text-[17px] text-muted">{m.scenarios.lede}</p>}
    >
      <aside
        className="card flex items-start gap-3 border border-dashed border-[color-mix(in_srgb,var(--warn)_55%,transparent)] bg-[color-mix(in_srgb,var(--warn)_7%,var(--sf))] p-5"
        aria-label={m.scenarios.notice}
      >
        <Icon name="info" size={20} className="mt-0.5 flex-none text-warn-ink" />
        <div className="flex flex-col gap-1">
          <strong className="text-[16px] font-semibold">{m.scenarios.notice}</strong>
          <p className="m-0 text-[14px] text-muted">{m.scenarios.noticeText}</p>
        </div>
      </aside>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label={m.scenarios.company}
          options={companies}
          value={company}
          onChange={(id) => {
            setCompany(id);
            setActive(null);
          }}
        />
        {company === 'equinor' ? (
          <span className="text-[13px] text-muted">{m.scenarios.equinorScope}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 nav:grid-cols-3">
        <SharePriceCard companyId={company} />

        <section
          aria-labelledby="res-h"
          className="card enter flex flex-col items-center gap-4 p-6"
          aria-live="polite"
        >
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <h2 id="res-h" className="m-0 text-[14px] font-semibold text-muted">
              {m.scenarios.result} · {name(company)}
            </h2>
            <SampleBadge detail={m.sample.scenario} />
          </div>
          {r ? (
            <ScenarioGauge medianPct={r.medianPct} lowPct={r.lowPct} highPct={r.highPct} />
          ) : result.isError ? (
            <p className="m-0 text-[14px] text-muted" role="alert">
              {m.scenarios.loadFailed}
            </p>
          ) : (
            <Skeleton width={240} height={150} />
          )}
          <span className="text-center text-[12.5px] text-muted">
            <Term id="range80">{m.glossary.range80.term}</Term>
          </span>
          <span className="rounded-full border border-[color-mix(in_srgb,var(--oil)_50%,transparent)] px-3 py-1 text-center text-[11.5px] font-semibold uppercase tracking-[0.05em] text-oil-ink">
            {m.scenarios.notice}
          </span>
        </section>

        <section
          aria-labelledby="sl-h"
          className="card enter flex flex-col gap-4 p-5 nav:col-span-2"
        >
          <div className="flex flex-col gap-3">
            <h2 id="sl-h" className="display m-0 text-h2 font-semibold">
              {m.scenarios.presets}
            </h2>
            <div role="group" aria-label={m.scenarios.presets} className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const on = active === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setParams(p.params(sverdrup.share));
                      setActive(p.id);
                    }}
                    className={`min-h-[40px] rounded-full px-4 text-[14px] font-medium transition-transform duration-300 hover:scale-[1.04] max-nav:min-h-[44px] ${
                      on ? 'bg-ink text-bg' : 'bg-surface2 text-ink hover:bg-surface3'
                    }`}
                  >
                    {m.scenarios[p.label]}
                  </button>
                );
              })}
            </div>
            {active === 'sverdrup' && sverdrup.month ? (
              <p className="m-0 text-[13px] text-muted">
                {t(m.scenarios.presetSverdrupNote, {
                  share: formatPct(sverdrup.share * 100, 0),
                  company: name(company),
                  month: formatMonth(sverdrup.month),
                  cut: formatPct(params.productionChangePct, 1),
                })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="cap">{m.scenarios.sliders}</span>
              <button
                type="button"
                className="btn px-3.5 text-[13px]"
                onClick={() => {
                  setParams(NEUTRAL_SCENARIO);
                  setActive('calm');
                }}
              >
                <Icon name="reset" size={15} />
                {m.scenarios.reset}
              </button>
            </div>
            <div className="grid gap-x-8 gap-y-4 nav:grid-cols-2">
              {sliders.map((s) => (
                <ScenarioSlider
                  key={s.key}
                  label={s.label}
                  value={params[s.key]}
                  min={SCENARIO_LIMITS[s.key].min}
                  max={SCENARIO_LIMITS[s.key].max}
                  step={s.step}
                  color={s.color}
                  text={s.text(params[s.key])}
                  spoken={s.spoken(params[s.key])}
                  onChange={(v) => set(s.key, v)}
                />
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="drv-h" className="card enter flex flex-col gap-3 p-5">
          <h2 id="drv-h" className="display m-0 text-h2 font-semibold">
            {m.scenarios.contributions}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {DRIVERS.map((d) => {
              const raw = r?.contributions[d] ?? 0;
              // Below the shown precision is zero, not "−0.0".
              const v = Math.abs(raw) < 0.05 ? 0 : raw;
              const width = (Math.abs(v) / maxContribution) * 50;
              return (
                <li key={d} className="flex flex-col gap-1">
                  <span className="flex justify-between text-[14px]">
                    <span>{m.scenarios.drivers[d]}</span>
                    <span className="num font-semibold">
                      {t(m.scenarios.pp, { v: formatSigned(v, 1) })}
                    </span>
                  </span>
                  <span className="relative block h-2 rounded-full bg-surface2" aria-hidden="true">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                    <span
                      className="absolute inset-y-0 rounded-full transition-all duration-500"
                      style={{
                        left: v < 0 ? `${50 - width}%` : '50%',
                        width: `${width}%`,
                        background: v < 0 ? 'var(--dn)' : 'var(--up)',
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="lbl">{m.scenarios.ppNote}</span>
        </section>

        <div className="nav:col-span-2">
          <WriteYourOwn onApply={applyParsed} />
        </div>
        <ModelFit model={model.data} />
      </div>
    </Page>
  );
}
