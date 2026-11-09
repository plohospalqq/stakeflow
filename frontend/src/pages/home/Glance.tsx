import { Link } from 'react-router';
import { useFields } from '@/api/hooks';
import type { ShelfSummary } from '@/api/types.summary';
import { Constellation } from '@/components/Constellation';
import { Rings } from '@/components/Rings';
import { Skeleton } from '@/components/Skeleton';
import { FreshnessSentence } from '@/components/layout/DataStatus';
import { Term } from '@/components/Term';
import { useI18n } from '@/i18n/useI18n';
import { formatDayMonth, formatMonthLong, formatShare } from '@/lib/format';
import { nextReleaseWindow } from '@/lib/release';
import { LargestFields } from './LargestFields';
import { PriceCards } from './PriceCards';
import { RecentAnomalies } from './RecentAnomalies';

function MixTile({ summary }: { summary: ShelfSummary }) {
  const { m, t } = useI18n();
  const parts = [
    { key: 'oil', label: m.products.oil, value: summary.mix.oil, color: 'var(--oil)' },
    { key: 'gas', label: m.products.gas, value: summary.mix.gas, color: 'var(--gas)' },
    { key: 'ngl', label: m.products.nglCond, value: summary.mix.nglCond, color: 'var(--cnd)' },
  ];
  return (
    <section
      aria-labelledby="mix-h"
      className="card enter flex flex-col items-center gap-6 p-6 sm:flex-row nav:col-span-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h3 id="mix-h" className="m-0 text-[13px] font-semibold text-muted">
          {m.home.mixTitle}
        </h3>
        <p className="display m-0 text-[24px] font-semibold leading-tight tracking-[-0.025em]">
          {t(m.home.mixText, { gas: formatShare(summary.mix.gas) })}
        </p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className="dot" style={{ background: p.color }} aria-hidden="true" />
              {p.key === 'ngl' ? <Term id="nglCond">{p.label}</Term> : p.label}
              <span className="num font-semibold">{formatShare(p.value, 1)}</span>
            </li>
          ))}
        </ul>
      </div>
      <Rings
        size={190}
        stroke={18}
        label={t(m.company.ringsLabel, {
          oil: formatShare(summary.mix.oil, 1),
          gas: formatShare(summary.mix.gas, 1),
          ngl: formatShare(summary.mix.nglCond, 1),
        })}
        rings={parts.map((p) => ({ key: p.key, value: p.value, color: p.color }))}
      />
    </section>
  );
}

function SkyTile() {
  const { m, plural } = useI18n();
  const fields = useFields('Producing');
  const points = (fields.data ?? []).flatMap((f) =>
    f.lon !== null && f.lat !== null && f.latest && f.latest.boePerDay > 0
      ? [
          {
            id: f.id,
            lon: f.lon,
            lat: f.lat,
            kboed: f.latest.boePerDay / 1000,
            oilShare: f.latest.mix.oil,
          },
        ]
      : [],
  );
  const count = plural(m.common.fields, points.length);
  return (
    // The night sky stays dark in both themes, like the map it previews.
    <Link
      to="/map"
      className="card enter lift relative flex min-h-[360px] flex-col overflow-hidden bg-[#05070b] p-5 text-white no-underline nav:col-span-2 nav:row-span-2 [.t-light_&]:bg-[#05070b]"
    >
      <span className="relative z-[1] flex items-start justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-white/70">{m.home.mapTitle}</span>
          <span className="max-w-[300px] text-[15px] text-white/90">
            {plural(m.home.mapText, points.length)}
          </span>
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
          {m.home.mapCta}
        </span>
      </span>
      <span className="absolute inset-x-4 bottom-4 top-24">
        {points.length ? (
          <Constellation points={points} label={count} />
        ) : (
          <Skeleton height="100%" />
        )}
      </span>
    </Link>
  );
}

function NextTile({ latestMonth }: { latestMonth: string }) {
  const { m, t } = useI18n();
  const w = nextReleaseWindow(latestMonth);
  return (
    <section aria-labelledby="next-h" className="card enter flex flex-col gap-2 p-5">
      <h3 id="next-h" className="m-0 text-[13px] font-semibold text-muted">
        {m.home.nextTitle}
      </h3>
      <p className="display num m-0 text-[28px] font-bold leading-tight tracking-[-0.03em]">
        {formatDayMonth(w.from)} – {formatDayMonth(w.to)}
      </p>
      <p className="m-0 text-[14px] text-muted">
        {t(m.home.nextText, { month: formatMonthLong(w.month) })}
      </p>
    </section>
  );
}

/** The dense view under the story: tiles for readers who want the numbers. */
export function Glance({ summary }: { summary: ShelfSummary | undefined }) {
  const { m } = useI18n();
  return (
    <section aria-labelledby="glance-h" className="flex flex-col gap-5 py-12">
      <div className="flex flex-col gap-1">
        <h2 id="glance-h" className="display m-0 text-display-l font-bold">
          {m.home.glanceTitle}
        </h2>
        <p className="m-0 text-[17px] text-muted">{m.home.glanceLede}</p>
      </div>
      <div className="grid grid-cols-1 gap-5 nav:grid-cols-4">
        {summary ? (
          <MixTile summary={summary} />
        ) : (
          <Skeleton height={240} className="nav:col-span-2" />
        )}
        <SkyTile />
        {summary ? <NextTile latestMonth={summary.month} /> : <Skeleton height={160} />}
        <PriceCards />
        <div className="min-w-0 nav:col-span-3">
          <LargestFields />
        </div>
        <RecentAnomalies />
      </div>
      {summary ? (
        <p className="lbl m-0">
          <FreshnessSentence latestMonth={summary.month} />
        </p>
      ) : null}
    </section>
  );
}
