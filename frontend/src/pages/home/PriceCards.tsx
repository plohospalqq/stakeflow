import { usePrices } from '@/api/hooks';
import type { PriceSeries } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { Term } from '@/components/Term';
import { useI18n } from '@/i18n/useI18n';
import { formatNumber } from '@/lib/format';

const WEEK = 5; // trading days

function PriceRow({ series }: { series: PriceSeries }) {
  const { m, t } = useI18n();
  const values = series.points.map((p) => p.value);
  const last = values[values.length - 1] ?? 0;
  const weekAgo = values[values.length - 1 - WEEK] ?? last;
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span
            className="dot"
            style={{ background: series.id === 'brent' ? 'var(--oil)' : 'var(--gas)' }}
            aria-hidden="true"
          />
          <Term id={series.id}>{series.name}</Term>
        </span>
        <DeltaBadge value={(last / weekAgo - 1) * 100} />
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="display num text-[30px] font-bold tracking-[-0.035em]">
          {formatNumber(last, 2)}
        </span>
        <span className="lbl">{series.unit}</span>
      </span>
      <Sparkline
        values={values}
        height={36}
        color={series.id === 'brent' ? 'var(--oil)' : 'var(--gas)'}
        label={t(m.home.priceAria, {
          name: series.name,
          from: formatNumber(values[0] ?? 0, 2),
          to: formatNumber(last, 2),
          unit: series.unit,
        })}
      />
    </li>
  );
}

/** Brent and TTF: sample until a price feed is connected, and badged as such. */
export function PriceCards() {
  const { m } = useI18n();
  const prices = usePrices();
  return (
    <section aria-labelledby="px-h" className="card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="px-h" className="m-0 text-[13px] font-semibold text-muted">
          {m.home.pricesTitle}
        </h3>
        <SampleBadge detail={m.sample.prices} />
      </div>
      {prices.data ? (
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {prices.data.map((s) => (
            <PriceRow key={s.id} series={s} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton width="50%" />
          <Skeleton height={28} width="60%" />
          <Skeleton height={36} />
        </div>
      )}
      <span className="lbl text-[12px]">{m.home.priceWeek}</span>
    </section>
  );
}
