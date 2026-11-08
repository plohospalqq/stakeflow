import { useId } from 'react';
import { SampleBadge } from '@/components/SampleBadge';
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
  label: string;
  min: number;
  max: number;
  step: number;
  text: (v: number) => string;
  spoken: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  {
    key: 'brentUsdPerBbl',
    label: 'Brent oil price',
    min: 40,
    max: 120,
    step: 0.5,
    text: (v) => `$${formatNumber(v, 1)} /bbl`,
    spoken: (v) => `${formatNumber(v, 1)} US dollars per barrel`,
  },
  {
    key: 'ttfEurPerMwh',
    label: 'TTF gas price',
    min: 10,
    max: 80,
    step: 0.5,
    text: (v) => `€${formatNumber(v, 1)} /MWh`,
    spoken: (v) => `${formatNumber(v, 1)} euros per megawatt hour`,
  },
  {
    key: 'realisationPct',
    label: 'Liquids realised vs Brent',
    min: 85,
    max: 105,
    step: 0.5,
    text: (v) => `${formatNumber(v, 1)}%`,
    spoken: (v) => `${formatNumber(v, 1)} percent of Brent`,
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
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-[13px]">
        <label htmlFor={id}>{spec.label}</label>
        <span className="num" aria-hidden="true">
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
        aria-valuetext={spec.spoken(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full cursor-pointer accent-[var(--tx)] max-nav:h-11"
      />
    </div>
  );
}

const bn = (usd: number) => formatNumber(usd / 1e9, 2);

export function RevenueCard({ model }: { model: RevenueModel | null }) {
  if (!model) {
    return (
      <section
        className="card flex min-w-0 flex-[2_1_380px] flex-col gap-3 p-[18px]"
        aria-busy="true"
      >
        <span className="sr-only">Loading revenue estimate</span>
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
    <section className="card flex min-w-0 flex-[2_1_380px] flex-col" aria-labelledby="rv-h">
      <div className="flex flex-col gap-0.5 border-b border-line px-[18px] pb-2.5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rv-h" className="m-0 text-h2">
            {quarter} revenue estimate
          </h2>
          <SampleBadge
            detail={`Prices${model.volumeIsSample ? ' and the nowcast volume' : ''} are sample data; the product split is from Sodir`}
          />
        </div>
        <span className="lbl">Volume × price. Move the sliders to test your own assumptions.</span>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-line px-[18px] py-4">
        <span className="flex items-baseline gap-2" aria-live="polite">
          <span className="num text-kpi">{formatUsd(e.totalUsd)}</span>
          <span className="lbl">sales value, {quarter}</span>
        </span>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded" aria-hidden="true">
          <span style={{ width: `${liquidsPct}%`, background: 'var(--oil)' }} />
          <span style={{ width: `${100 - liquidsPct}%`, background: 'var(--gas)' }} />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="dot bg-oil" aria-hidden="true" />
            Liquids <span className="num text-ink">${bn(e.liquidsUsd)} bn</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="dot bg-gas" aria-hidden="true" />
            Gas <span className="num text-ink">${bn(e.gasUsd)} bn</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-line px-[18px] py-3.5">
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
            className="min-h-[36px] text-[12px] text-muted underline underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-60"
            onClick={model.reset}
            disabled={model.isAtForward}
          >
            Reset to forward prices
          </button>
          <span className="lbl">Forward curve, {formatDate(model.forwardAsOf)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-[18px] pb-4 pt-3.5">
        <span className="cap">The maths</span>
        <dl className="num m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
          <dt>
            Liquids {formatNumber(e.liquidsKbblPerDay, 1)} kbbl/d × {model.days} d × $
            {formatNumber(prices.brentUsdPerBbl, 1)} × {formatNumber(prices.realisationPct, 1)}%
          </dt>
          <dd>${bn(e.liquidsUsd)} bn</dd>
          <dt>
            Gas {formatNumber(e.gasMsm3PerDay, 2)} MSm³/d × {model.days} d × {GAS_KWH_PER_SM3}{' '}
            kWh/Sm³ × €{formatNumber(prices.ttfEurPerMwh, 1)}/MWh × {formatNumber(model.eurUsd, 2)}{' '}
            USD/EUR
          </dt>
          <dd>${bn(e.gasUsd)} bn</dd>
        </dl>
        <ul className="lbl m-0 flex list-disc flex-col gap-1 pl-4">
          <li>
            Volume: {model.volumeLabel}, {formatNumber(model.kboed, 1)} kboe/d, split{' '}
            {formatShare(model.liquidsShare)} liquids (oil + NGL/condensate) as in Sodir data for{' '}
            {formatMonth(model.splitFrom)}–{formatMonth(model.splitTo)}.
          </li>
          <li>
            Revenue follows volumes <strong className="font-semibold text-ink">sold</strong>, not
            produced. Over- or underlift moves them apart: Aker BP produced 374.3 but sold 395.7
            kboe/d in Q3 2026.
          </li>
          <li>
            Excludes hedging, transport tariffs and inventory timing. Gas is partly sold on fixed or
            year-ahead contracts, so TTF spot overstates how much revenue moves with it.
          </li>
        </ul>
      </div>
    </section>
  );
}
