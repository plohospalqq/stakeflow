import type { ReactNode } from 'react';
import type { ShelfSummary } from '@/api/types.summary';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { formatCompactLong, formatNumber, formatPct, formatShare } from '@/lib/format';
import { homesHeated, largestOilField } from '@/lib/plain';

function Tile({
  value,
  color,
  index,
  children,
}: {
  value: ReactNode;
  color?: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <li className="card enter lift flex flex-col gap-3 p-7 nav:p-8" style={{ '--i': index }}>
      <span
        className="display num text-[56px] font-bold leading-none tracking-[-0.045em] nav:text-[64px]"
        style={{ color }}
      >
        {value}
      </span>
      <p className="m-0 text-[17px] leading-[1.45] text-muted">{children}</p>
    </li>
  );
}

/** Three facts in plain words, each computed from the latest real data. */
export function Facts({ summary }: { summary: ShelfSummary | undefined }) {
  const { m, simple } = useI18n();
  if (!summary) {
    return (
      <ul className="m-0 grid list-none gap-5 p-0 nav:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="card flex flex-col gap-3 p-8">
            <Skeleton width="50%" height={56} />
            <Skeleton height={48} />
          </li>
        ))}
      </ul>
    );
  }
  const homes = homesHeated(summary.gasYearBnSm3) / 1e6;
  const oil = largestOilField(summary);
  return (
    <section aria-labelledby="facts-h" className="flex flex-col gap-4">
      <h2 id="facts-h" className="sr-only">
        {m.home.factsTitle}
      </h2>
      <ul className="m-0 grid list-none gap-5 p-0 nav:grid-cols-3">
        <Tile value={formatShare(summary.stateShare)} color="var(--oil-ink)" index={0}>
          <Rich
            text={m.home.stateText}
            vars={{ barrels: formatCompactLong(summary.stateBoePerDay) }}
            strong={(c, k) =>
              simple ? (
                <Term key={k} id="state">
                  <strong className="font-semibold text-ink">{c}</strong>
                </Term>
              ) : (
                <strong key={k} className="font-semibold text-ink">
                  {c}
                </strong>
              )
            }
          />
        </Tile>
        <Tile
          value={
            <>
              ~{formatNumber(homes, 0)}
              <span className="ml-2 text-[22px] font-semibold tracking-[-0.02em]">
                {m.home.homesUnit}
              </span>
            </>
          }
          color="var(--gas-ink)"
          index={1}
        >
          <Rich
            text={m.home.homesText}
            vars={{ bcm: formatNumber(summary.gasYearBnSm3, 0), year: summary.gasYear }}
          />
        </Tile>
        {oil ? (
          <Tile value={formatPct(oil.yoyPct, 0, true)} index={2}>
            <Rich
              text={oil.yoyPct < 0 ? m.home.declineText : m.home.growthText}
              vars={{ field: oil.field.name, pct: formatPct(Math.abs(oil.yoyPct), 0) }}
            />
          </Tile>
        ) : null}
      </ul>
      <p className="lbl m-0 max-w-[820px]">{m.home.homesNote}</p>
    </section>
  );
}
