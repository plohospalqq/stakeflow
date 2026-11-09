import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCompanyFields, useFreshness, useScenario, useScenarioPresets } from '@/api/hooks';
import { isUnavailable } from '@/api/http';
import { IS_STATIC_DEMO, isSample } from '@/api/mode';
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
import { formatDate, formatMonth, formatNumber, formatPct } from '@/lib/format';
import { clampScenario, DRIVERS, NEUTRAL_SCENARIO, SCENARIO_LIMITS } from '@/lib/scenario';
import { ModelFit } from './scenarios/ModelFit';
import {
  DEFAULT_PARAMS,
  DEFAULT_PRESET,
  orderPresets,
  presetWords,
  SCENARIO_COMPANIES,
} from './scenarios/presets';
import { ScenarioSlider } from './scenarios/ScenarioSlider';
import { SharePriceCard } from './scenarios/SharePriceCard';
import { WriteYourOwn } from './scenarios/WriteYourOwn';

const SVERDRUP = 26376286;

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
function useScenarioUrl(): [string, (id: string) => void, string | null] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('co');
  const company = raw && SCENARIO_COMPANIES.includes(raw) ? raw : 'aker-bp';
  const setCompany = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('co', id);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return [company, setCompany, params.get('preset')];
}

export default function Scenarios() {
  const { m, t, plural } = useI18n();
  const name = useCompanyName();
  const [company, setCompany, presetFromUrl] = useScenarioUrl();
  const sverdrup = useSverdrupShare(company);
  const presetQuery = useScenarioPresets();
  const presets = useMemo(() => orderPresets(presetQuery.data ?? []), [presetQuery.data]);
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [active, setActive] = useState<string | null>(DEFAULT_PRESET);
  const settled = useDebounced(params, 120);
  const result = useScenario(company, settled);
  const sample = isSample('scenario');

  // A preset in the link (from the landing page) applies once the presets are known.
  const appliedFromUrl = useRef(false);
  useEffect(() => {
    if (appliedFromUrl.current || !presetFromUrl) return;
    const preset = presets.find((p) => p.id === presetFromUrl);
    if (!preset) return;
    appliedFromUrl.current = true;
    setParams(preset.params);
    setActive(preset.id);
  }, [presetFromUrl, presets]);

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
    // The parser computed a production change for the company the text named.
    if (parsed.companyId && SCENARIO_COMPANIES.includes(parsed.companyId)) {
      setCompany(parsed.companyId);
    }
    setActive(null);
  };

  const companies = SCENARIO_COMPANIES.map((id) => ({ value: id, label: name(id) }));
  const pct = (v: number) => formatPct(v, 0, true);
  const spoken = (v: number) => t(m.scenarios.change, { v: formatPct(v, 0, true) });
  const r = result.data;
  const activePreset = presets.find((p) => p.id === active);
  const activeWords = activePreset ? presetWords(m, activePreset) : null;
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
  const sampleDetail = IS_STATIC_DEMO ? m.sample.scenarioStatic : m.sample.scenario;
  const unavailable = result.isError && isUnavailable(result.error) ? result.error : null;

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
          {IS_STATIC_DEMO ? (
            <p className="m-0 text-[14px] text-muted">{m.scenarios.staticNote}</p>
          ) : null}
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
            {sample ? <SampleBadge detail={sampleDetail} /> : null}
          </div>
          {r ? (
            <ScenarioGauge medianPct={r.medianPct} lowPct={r.lowPct} highPct={r.highPct} />
          ) : unavailable ? (
            <div className="flex flex-col gap-1.5 text-[14px] text-muted" role="alert">
              <p className="m-0">{m.scenarios.noModel}</p>
              {unavailable.detail ? (
                <p lang="en" className="lbl m-0">
                  {unavailable.detail}
                </p>
              ) : null}
            </div>
          ) : result.isError ? (
            <p className="m-0 text-[14px] text-muted" role="alert">
              {m.scenarios.loadFailed}
            </p>
          ) : (
            <Skeleton width={240} height={150} />
          )}
          {r?.price ? (
            <p className="m-0 text-center text-[13px] text-muted">
              {t(m.scenarios.priceLine, {
                base: formatNumber(r.price.base, 1),
                currency: r.price.currency,
                date: formatDate(r.price.date),
                median: formatNumber(r.price.median, 0),
                low: formatNumber(r.price.low, 0),
                high: formatNumber(r.price.high, 0),
              })}
            </p>
          ) : null}
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
              {presets.map((p) => {
                const on = active === p.id;
                const words = presetWords(m, p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    lang={words.lang}
                    onClick={() => {
                      setParams(p.params);
                      setActive(p.id);
                    }}
                    className={`min-h-[40px] rounded-full px-4 text-[14px] font-medium transition-transform duration-300 hover:scale-[1.04] max-nav:min-h-[44px] ${
                      on ? 'bg-ink text-bg' : 'bg-surface2 text-ink hover:bg-surface3'
                    }`}
                  >
                    {words.label}
                  </button>
                );
              })}
            </div>
            {activeWords ? (
              <p lang={activeWords.lang} className="m-0 text-[13px] text-muted">
                {activeWords.text}
              </p>
            ) : null}
            {active === 'sverdrup-outage' && sverdrup.month && sverdrup.share > 0 ? (
              <p className="m-0 text-[13px] text-muted">
                {t(m.scenarios.presetSverdrupNote, {
                  share: formatPct(sverdrup.share * 100, 0),
                  company: name(company),
                  month: formatMonth(sverdrup.month),
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
                  setActive(null);
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
                    <span className="num font-semibold">{formatPct(v, 1, true)}</span>
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
          <span className="lbl">{m.scenarios.driverNote}</span>
          {r && (r.caveats.length > 0 || r.notice) ? (
            <div className="flex w-full flex-col gap-1.5 border-t border-line pt-3">
              <span className="cap">{m.scenarios.caveats}</span>
              <ul lang="en" className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {r.caveats.map((c) => (
                  <li key={c} className="flex gap-1.5 text-muted">
                    <Icon name="info" size={14} className="mt-0.5 flex-none text-warn-ink" />
                    <span>{c}</span>
                  </li>
                ))}
                {r.notice ? <li className="font-semibold text-ink">{r.notice}</li> : null}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="nav:col-span-2">
          <WriteYourOwn companyId={company} onApply={applyParsed} />
        </div>
        <ModelFit model={r?.model} failed={result.isError} />
      </div>
    </Page>
  );
}
