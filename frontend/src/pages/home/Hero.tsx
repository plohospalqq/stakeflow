import type { ShelfSummary } from '@/api/types.summary';
import { CountUp } from '@/components/CountUp';
import { DeltaBadge } from '@/components/DeltaBadge';
import { Skeleton } from '@/components/Skeleton';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { addMonths, daysInMonth } from '@/lib/dates';
import { formatMonthLong, formatMonthName, formatNumber } from '@/lib/format';
import { rateToDisplay } from '@/lib/units';
import { useUnitStore } from '@/stores/unit';

/** Keynote opener: one giant number, counted up, and one sentence on what Stakeflow does. */
export function Hero({ summary }: { summary: ShelfSummary | undefined }) {
  const { m, t, v } = useI18n();
  const unit = useUnitStore((s) => s.unit);

  if (!summary) {
    return (
      <section className="flex flex-col items-center gap-5 pb-16 pt-20 text-center nav:pt-28">
        <Skeleton width={180} height={14} />
        <Skeleton width="min(520px, 80vw)" height={160} />
        <Skeleton width="min(560px, 80vw)" height={40} />
      </section>
    );
  }

  const days = daysInMonth(summary.month);
  // Millions: boe per day, or Sm³ o.e. in the month (the unit toggle reaches the hero too).
  const value =
    unit === 'boe' ? summary.boePerDay / 1e6 : rateToDisplay(summary.boePerDay / 1000, 'sm3', days);
  const pct = (other: number | null) =>
    other && other > 0 ? (summary.boePerDay / other - 1) * 100 : null;
  const mom = pct(summary.prevMonthBoePerDay);
  const yoy = pct(summary.yearAgoBoePerDay);
  const month = formatMonthLong(summary.month);

  return (
    <section
      aria-labelledby="hero-h"
      className="flex flex-col items-center px-2 pb-14 pt-16 text-center nav:pb-20 nav:pt-28"
    >
      <p className="eyebrow enter m-0 mb-5">{t(m.home.eyebrow, { month })}</p>
      <h1 id="hero-h" className="m-0 flex flex-col items-center">
        <span className="sr-only">
          {t(unit === 'boe' ? m.home.heroSr : m.home.heroSrSm3, {
            value: formatNumber(value, unit === 'boe' ? 2 : 1),
            month,
          })}
        </span>
        <span
          aria-hidden="true"
          className="display num bg-clip-text pb-2 text-hero font-extrabold text-transparent"
          style={{ backgroundImage: 'var(--hero-grad)', WebkitBackgroundClip: 'text' }}
        >
          <CountUp
            value={value}
            format={(x) => formatNumber(x, unit === 'boe' ? 2 : 1)}
            duration={1600}
          />
        </span>
        <span
          aria-hidden="true"
          className="display enter mt-2 max-w-[18ch] text-[clamp(26px,3.4vw,46px)] font-semibold leading-[1.1] tracking-[-0.03em] nav:max-w-none"
          style={{ '--i': 3 }}
        >
          {v(unit === 'boe' ? m.home.heroUnit : m.home.heroUnitSm3)}
        </span>
      </h1>
      {mom !== null || yoy !== null ? (
        <p
          className="enter m-0 mt-5 flex flex-wrap items-center justify-center gap-2 text-[14px] text-muted"
          style={{ '--i': 4 }}
        >
          {mom !== null ? <DeltaBadge value={mom} /> : null}
          <span>
            {t(m.common.vsMonth, { month: formatMonthName(addMonths(summary.month, -1)) })}
          </span>
          {yoy !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <DeltaBadge value={yoy} />
              <span>{m.common.yearAgo}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <p
        className="enter m-0 mt-7 max-w-[640px] text-[19px] leading-[1.5] text-muted nav:text-[21px]"
        style={{ '--i': 5 }}
      >
        <Rich text={m.home.lede} vars={{ fields: summary.producingFields }} />
      </p>
    </section>
  );
}
