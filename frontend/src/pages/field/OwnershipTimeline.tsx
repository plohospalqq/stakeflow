import { useMemo, useState } from 'react';
import type { LicenceShare } from '@/api/types';
import { SectionHeading } from '@/components/SectionHeading';
import { Skeleton } from '@/components/Skeleton';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';
import { diffDays, monthStart, parseIsoDate } from '@/lib/dates';
import { formatDate, formatMonth, formatNumber } from '@/lib/format';
import {
  groupPeriods,
  ownershipEvents,
  type GroupPeriod,
  type OwnershipEvent,
} from '@/lib/ownership';

interface OwnershipTimelineProps {
  periods: LicenceShare[] | undefined;
  /** End of the axis: the latest data month. */
  today: string;
  firstProductionMonth: string | null;
}

const pct = (v: number) => `${formatNumber(v, 2)}%`;

interface TimelineItem {
  kind: 'change' | 'onstream';
  date: string;
  events: OwnershipEvent[];
}

export function OwnershipTimeline({
  periods,
  today,
  firstProductionMonth,
}: OwnershipTimelineProps) {
  const { m, t, plural } = useI18n();
  const companyName = useCompanyName();
  const [showAll, setShowAll] = useState(false);
  const data = useMemo(() => {
    if (!periods || periods.length === 0) return null;
    const grouped = groupPeriods(periods);
    const start = grouped.reduce((min, p) => (p.validFrom < min ? p.validFrom : min), today);
    const span = Math.max(1, diffDays(start, today));
    const pos = (date: string | null) =>
      Math.min(
        100,
        Math.max(0, (diffDays(start, date && date < today ? date : today) / span) * 100),
      );
    const current = (groupId: string) =>
      grouped.find((p) => p.groupId === groupId && (p.validTo === null || p.validTo > today))
        ?.sharePct ?? 0;
    const lastEnd = (groupId: string) =>
      grouped
        .filter((p) => p.groupId === groupId)
        .reduce((max, p) => ((p.validTo ?? '9999') > max ? (p.validTo ?? '9999') : max), '');
    const rows = [...new Set(grouped.map((p) => p.groupId))]
      .map((groupId) => ({
        groupId,
        name: grouped.find((p) => p.groupId === groupId)?.groupName ?? groupId,
        segments: grouped.filter((p) => p.groupId === groupId),
        current: current(groupId),
        lastEnd: lastEnd(groupId),
      }))
      .sort((a, b) => b.current - a.current || b.lastEnd.localeCompare(a.lastEnd));
    const startYear = parseIsoDate(start).getUTCFullYear();
    const endYear = parseIsoDate(today).getUTCFullYear();
    const step = Math.max(1, Math.ceil((endYear - startYear) / 6));
    const ticks: { label: string; left: number }[] = [];
    for (let y = startYear + 1; y <= endYear; y += step) {
      ticks.push({ label: String(y), left: pos(`${y}-01-01`) });
    }
    const events = ownershipEvents(grouped);
    const byDate = new Map<string, typeof events>();
    for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    const ownersAtStart = firstProductionMonth
      ? new Set(
          grouped
            .filter(
              (p) =>
                p.validFrom <= firstProductionMonth &&
                (p.validTo === null || p.validTo > firstProductionMonth),
            )
            .map((p) => p.groupId),
        ).size
      : 0;
    // One chronological list (newest first) with the start of production slotted in.
    const timeline: TimelineItem[] = [...byDate.entries()].map(([date, list]) => ({
      kind: 'change',
      date,
      events: list,
    }));
    if (firstProductionMonth)
      timeline.push({ kind: 'onstream', date: firstProductionMonth, events: [] });
    timeline.sort((a, b) => b.date.localeCompare(a.date));
    return { rows, ticks, pos, byDate: timeline, ownersAtStart };
  }, [periods, today, firstProductionMonth]);

  const segmentText = (s: GroupPeriod) =>
    s.validTo
      ? t(m.field.segment, {
          pct: pct(s.sharePct),
          from: formatDate(s.validFrom),
          to: formatDate(s.validTo),
        })
      : t(m.field.segmentToday, { pct: pct(s.sharePct), from: formatDate(s.validFrom) });
  // Equinor's scope label is localised; other names are data.
  const display = (groupId: string, fallback: string) =>
    FOCUS_ORDER.includes(groupId) ? companyName(groupId, fallback) : fallback;

  const visibleEvents = data ? (showAll ? data.byDate : data.byDate.slice(0, 5)) : [];

  return (
    <section className="card flex min-w-0 flex-col" aria-labelledby="own-h">
      <SectionHeading id="own-h" title={m.field.ownershipTitle} sub={m.field.ownershipSub} />
      {!data ? (
        <div className="flex flex-col gap-2 px-[18px] pb-4 pt-2">
          {periods ? (
            <p className="lbl m-0">{m.field.noOwnership}</p>
          ) : (
            [0, 1, 2].map((i) => <Skeleton key={i} height={26} />)
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 px-[18px] pb-1.5 pt-2.5">
            <div className="relative ml-0 h-4 nav:ml-[152px]" aria-hidden="true">
              {data.ticks.map((t) => (
                <span
                  key={t.label}
                  className="num lbl absolute -translate-x-1/2 text-[11px]"
                  style={{ left: `${t.left}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.rows.map((row) => {
                const focus = FOCUS_ORDER.includes(row.groupId);
                return (
                  <li
                    key={row.groupId}
                    className="flex flex-col gap-1 nav:flex-row nav:items-center nav:gap-3"
                  >
                    {/* Wraps instead of truncating: company names (e.g. "Equinor (NCS only)")
                        must always be readable in full, and a title tooltip fails on touch. */}
                    <span
                      className={`w-full flex-none break-words text-[13px] leading-tight nav:w-[140px] ${focus ? 'font-semibold' : ''}`}
                    >
                      {display(row.groupId, row.name)}
                    </span>
                    <span className="sr-only">{row.segments.map(segmentText).join('; ')}</span>
                    <div
                      className="relative h-[26px] w-full rounded-chip bg-surface2 nav:w-auto nav:flex-1"
                      aria-hidden="true"
                    >
                      {row.segments.map((s) => {
                        const left = data.pos(s.validFrom);
                        const width = Math.max(0.6, data.pos(s.validTo) - left);
                        return (
                          <div
                            key={s.validFrom}
                            title={segmentText(s)}
                            className="num absolute bottom-[3px] top-[3px] flex items-center overflow-hidden whitespace-nowrap rounded px-2 text-[11px] font-semibold"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: focus ? 'var(--fc)' : 'var(--bd2)',
                              color: focus ? 'var(--bg)' : 'var(--tx)',
                            }}
                          >
                            {width > 9 ? pct(s.sharePct) : ''}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 border-t border-line px-[18px] pb-4 pt-3 text-[13px]">
            {visibleEvents.map((item) =>
              item.kind === 'onstream' ? (
                <li key="onstream" className="flex gap-3">
                  <span className="num lbl w-[76px] flex-none pt-px">{formatMonth(item.date)}</span>
                  <span>{plural(m.field.onStreamEvent, data.ownersAtStart)}</span>
                </li>
              ) : (
                <li key={item.date} className="flex gap-3">
                  <span className="num lbl w-[76px] flex-none pt-px">
                    {formatMonth(monthStart(item.date))}
                  </span>
                  <span>
                    {item.events.map((e, i) => (
                      <span key={e.groupName}>
                        {i > 0 ? ' · ' : ''}
                        <strong className="font-semibold">{e.groupName}</strong>{' '}
                        {e.fromPct === 0
                          ? t(m.field.enters, { pct: pct(e.toPct) })
                          : e.toPct === 0
                            ? t(m.field.leaves, { pct: pct(e.fromPct) })
                            : `${pct(e.fromPct)} → ${pct(e.toPct)}`}
                      </span>
                    ))}
                  </span>
                </li>
              ),
            )}
            {data.byDate.length > 5 ? (
              <li>
                <button
                  type="button"
                  className="min-h-[36px] rounded-full bg-surface2 px-3.5 text-[13px] font-medium text-ink hover:bg-surface3"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((s) => !s)}
                >
                  {showAll ? m.common.showFewer : t(m.common.showAll, { n: data.byDate.length })}
                </button>
              </li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}
