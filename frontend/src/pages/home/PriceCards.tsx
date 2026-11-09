import { usePrices } from '@/api/hooks';
import { isSample } from '@/api/mode';
import type { PriceSeries } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { Term } from '@/components/Term';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatMonth, formatNumber } from '@/lib/format';

/** About three months of trading days for Brent; TTF is one point a month, so a year of it. */
const DAILY_POINTS = 63;
const WEEK = 5;

function PriceRow({ series }: { series: PriceSeries }) {
  const { m, t, plural } = useI18n();
  const daily = series.frequency === 'daily';
  const points = daily ? series.points.slice(-DAILY_POINTS) : series.points;
  const values = points.map((p) => p.value);
  const last = values[values.length - 1] ?? 0;
  // A week back for a daily series, the month before for a monthly one.
  const before = values[values.length - 1 - (daily ? WEEK : 1)] ?? last;
  const lastPoint = points[points.length - 1];
  const months = daily ? 3 : points.length;
  const name = series.id === 'brent' ? m.home.brentName : m.home.ttfName;
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span
            className="dot"
            style={{ background: series.id === 'brent' ? 'var(--oil)' : 'var(--gas)' }}
            aria-hidden="true"
          />
          <Term id={series.id}>{name}</Term>
        </span>
        <span className="flex items-center gap-1.5">
          <DeltaBadge value={(last / before - 1) * 100} />
          <span className="lbl">{daily ? m.home.vsWeek : m.home.vsMonth}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="display num text-[30px] font-bold tracking-[-0.035em]">
          {formatNumber(last, 2)}
        </span>
        <span className="lbl">{series.unit}</span>
        {lastPoint ? (
          <span className="lbl">
            ·{' '}
            {daily
              ? t(m.home.priceDaily, { date: formatDate(lastPoint.date) })
              : t(m.home.priceMonthly, { month: formatMonth(lastPoint.date) })}
          </span>
        ) : null}
      </span>
      <Sparkline
        values={values}
        height={36}
        color={series.id === 'brent' ? 'var(--oil)' : 'var(--gas)'}
        label={t(m.home.priceAria, {
          name,
          period: plural(m.common.months, months),
          from: formatNumber(values[0] ?? 0, 2),
          to: formatNumber(last, 2),
          unit: series.unit,
        })}
      />
    </li>
  );
}

/** Brent (daily spot) and TTF (monthly average), with their sources. */
export function PriceCards() {
  const { m } = useI18n();
  const prices = usePrices();
  const sample = isSample('prices');
  return (
    <section aria-labelledby="px-h" className="card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="px-h" className="m-0 text-[13px] font-semibold text-muted">
          {m.home.pricesTitle}
        </h3>
        {sample ? <SampleBadge detail={m.sample.prices} /> : null}
      </div>
      {prices.data ? (
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {prices.data.map((s) => (
            <PriceRow key={s.id} series={s} />
          ))}
        </ul>
      ) : prices.isError ? (
        <p className="m-0 text-[14px] text-muted">{m.home.pricesFailed}</p>
      ) : (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton width="50%" />
          <Skeleton height={28} width="60%" />
          <Skeleton height={36} />
        </div>
      )}
      <span className="lbl text-[12px]">{sample ? m.home.priceNote : m.home.priceSources}</span>
    </section>
  );
}
