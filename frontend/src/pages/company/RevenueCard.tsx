import { useId } from 'react';
import { SampleBadge } from '@/components/SampleBadge';
import { Term } from '@/components/Term';
import { Rich } from '@/i18n/Rich';
import type { Dict } from '@/i18n/types';
import { useI18n } from '@/i18n/useI18n';
import { fill } from '@/i18n/text';
import { Skeleton } from '@/components/Skeleton';
import {
  formatDate,
  formatMonth,
  formatNumber,
  formatQuarter,
  formatShare,
  formatUsd,
} from '@/lib/format';
import { GAS_KWH_PER_SM3 } from '@/lib/revenue';
import type { PriceInputs, RevenueModel } from './useRevenue';

interface SliderSpec {
  key: keyof PriceInputs;
  label: (m: Dict) => string;
  min: number;
  max: number;
  step: number;
  text: (v: number) => string;
  spoken: (v: number, m: Dict) => string;
}

const SLIDERS: SliderSpec[] = [
  {
    key: 'brentUsdPerBbl',
    label: (m) => m.revenue.brent,
    min: 40,
    max: 120,
    step: 0.5,
    text: (v) => `$${formatNumber(v, 1)} /bbl`,
    spoken: (v, m) => fill(m.revenue.brentSpoken, { v: formatNumber(v, 1) }),
  },
  {
    key: 'ttfEurPerMwh',
    label: (m) => m.revenue.ttf,
    min: 10,
    max: 80,
    step: 0.5,
    text: (v) => `€${formatNumber(v, 1)} /MWh`,
    spoken: (v, m) => fill(m.revenue.ttfSpoken, { v: formatNumber(v, 1) }),
  },
  {
    key: 'realisationPct',
    label: (m) => m.revenue.realisation,
    min: 85,
    max: 105,
    step: 0.5,
    text: (v) => `${formatNumber(v, 1)}%`,
    spoken: (v, m) => fill(m.revenue.realisationSpoken, { v: formatNumber(v, 1) }),
  },
];

function Slider({
  spec,
  value,
  onChange,
}: {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const { m } = useI18n();
  const fillPct = ((value - spec.min) / (spec.max - spec.min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-[14px]">
        <label htmlFor={id}>{spec.label(m)}</label>
        <span className="num font-semibold" aria-hidden="true">
          {spec.text(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-valuetext={spec.spoken(value, m)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{ '--fill': `${fillPct}%` }}
      />
    </div>
  );
}

export function RevenueCard({ model }: { model: RevenueModel | null }) {
  const { m, t } = useI18n();
  if (!model) {
    return (
      <section className="card flex min-w-0 flex-col gap-3 p-5" aria-busy="true">
        <span className="sr-only">{m.revenue.loading}</span>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={30} />
        <Skeleton height={140} />
      </section>
    );
  }

  const { estimate: e, prices } = model;
  const liquidsPct = e.totalUsd > 0 ? (e.liquidsUsd / e.totalUsd) * 100 : 0;
  const quarter = formatQuarter(model.quarterStart);

  return (
    <section className="card enter flex min-w-0 flex-col" aria-labelledby="rv-h">
      <div className="flex flex-col gap-0.5 px-5 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rv-h" className="display m-0 text-h2 font-semibold">
            {t(m.revenue.title, { quarter })}
          </h2>
          <SampleBadge detail={model.volumeIsSample ? m.sample.revenueNowcast : m.sample.revenue} />
        </div>
        <span className="lbl">{m.revenue.sub}</span>
      </div>

      <div className="flex flex-col gap-2 px-5 pb-4">
        <span className="flex flex-wrap items-baseline gap-2" aria-live="polite">
          <span className="display num text-kpi font-bold">{formatUsd(e.totalUsd)}</span>
          <span className="lbl">{t(m.revenue.salesValue, { quarter })}</span>
        </span>
        <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
          <span
            className="rounded-full"
            style={{ width: `${liquidsPct}%`, background: 'var(--oil)' }}
          />
          <span
            className="rounded-full"
            style={{ width: `${100 - liquidsPct}%`, background: 'var(--gas)' }}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="dot bg-oil" aria-hidden="true" />
            {m.revenue.liquids}{' '}
            <span className="num font-semibold text-ink">{formatUsd(e.liquidsUsd)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="dot bg-gas" aria-hidden="true" />
            {m.revenue.gas}{' '}
            <span className="num font-semibold text-ink">{formatUsd(e.gasUsd)}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        {SLIDERS.map((spec) => (
          <Slider
            key={spec.key}
            spec={spec}
            value={prices[spec.key]}
            onChange={(v) => model.setPrice(spec.key, v)}
          />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn px-3.5 text-[13px]"
            onClick={model.reset}
            disabled={model.isAtForward}
          >
            {m.revenue.reset}
          </button>
          <span className="lbl">
            {t(m.revenue.forward, { date: formatDate(model.forwardAsOf) })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line px-5 pb-5 pt-4">
        <span className="cap">{m.revenue.maths}</span>
        <dl className="num m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12.5px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
          <dt>
            {m.revenue.liquids} {formatNumber(e.liquidsKbblPerDay, 1)} kbbl/d × {model.days} d × $
            {formatNumber(prices.brentUsdPerBbl, 1)} × {formatNumber(prices.realisationPct, 1)}%
          </dt>
          <dd>{formatUsd(e.liquidsUsd)}</dd>
          <dt>
            {m.revenue.gas} {formatNumber(e.gasMsm3PerDay, 2)} MSm³/d × {model.days} d ×{' '}
            {GAS_KWH_PER_SM3} kWh/Sm³ × €{formatNumber(prices.ttfEurPerMwh, 1)}/MWh ×{' '}
            {formatNumber(model.eurUsd, 2)} USD/EUR
          </dt>
          <dd>{formatUsd(e.gasUsd)}</dd>
        </dl>
        <ul className="lbl m-0 flex list-disc flex-col gap-1 pl-4">
          <li>
            {t(m.revenue.volume, {
              label: model.volumeLabel,
              kboed: formatNumber(model.kboed, 1),
              liquids: formatShare(model.liquidsShare),
              from: formatMonth(model.splitFrom),
              to: formatMonth(model.splitTo),
            })}
          </li>
          <li>
            <Rich text={m.revenue.sold} />
          </li>
          <li>{m.revenue.excludes}</li>
        </ul>
        <p className="lbl m-0">
          <Term id="brent" /> · <Term id="ttf" />
        </p>
      </div>
    </section>
  );
}
