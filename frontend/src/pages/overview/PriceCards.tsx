import { usePrices } from '@/api/hooks';
import type { PriceSeries } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { formatNumber } from '@/lib/format';

const WEEK = 5; // trading days

function PriceCard({ series }: { series: PriceSeries }) {
  const values = series.points.map((p) => p.value);
  const last = values[values.length - 1] ?? 0;
  const weekAgo = values[values.length - 1 - WEEK] ?? last;
  return (
    <div className="card flex min-w-0 flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{series.name}</span>
        <DeltaBadge value={(last / weekAgo - 1) * 100} />
      </div>
      <span className="flex items-baseline gap-1.5">
        <span className="num text-[22px] font-semibold">{formatNumber(last, 2)}</span>
        <span className="lbl">{series.unit}</span>
      </span>
      <Sparkline
        values={values}
        height={34}
        strokeWidth={1.3}
        label={`${series.name} price over the last three months, from ${formatNumber(values[0] ?? 0, 2)} to ${formatNumber(last, 2)} ${series.unit}`}
      />
      <span className="lbl text-[11px]">3 months · change vs 1 week ago</span>
    </div>
  );
}

export function PriceCards() {
  const prices = usePrices();
  return (
    <section aria-labelledby="px-h" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 id="px-h" className="m-0 text-[13px] font-semibold">
          Prices
        </h2>
        <SampleBadge detail="Brent and TTF prices are generated until a price feed is connected" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {prices.data
          ? prices.data.map((s) => <PriceCard key={s.id} series={s} />)
          : [0, 1].map((i) => (
              <div key={i} className="card flex flex-col gap-2 p-4" aria-busy="true">
                <Skeleton width="50%" />
                <Skeleton height={22} width="60%" />
                <Skeleton height={34} />
              </div>
            ))}
      </div>
    </section>
  );
}
