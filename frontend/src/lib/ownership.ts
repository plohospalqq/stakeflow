/**
 * Ownership helpers shared by the mock layer and the field page. Shares are attributed
 * day-weighted within a month: deals close mid-month, and a month-end share would
 * misattribute the whole month.
 */
import type { LicenceShare } from '@/api/types';
import { addMonths, diffDays, daysInMonth, monthStart } from './dates';

/** Day-weighted share (percent) of `groupId` in `month`. validTo is exclusive. */
export function effectiveSharePct(periods: LicenceShare[], groupId: string, month: string): number {
  const start = monthStart(month);
  const end = addMonths(start, 1);
  const days = daysInMonth(start);
  let weighted = 0;
  for (const p of periods) {
    if (p.groupId !== groupId) continue;
    const from = p.validFrom > start ? p.validFrom : start;
    const to = p.validTo && p.validTo < end ? p.validTo : end;
    const overlap = diffDays(from, to);
    if (overlap > 0) weighted += p.sharePct * overlap;
  }
  return weighted / days;
}

export interface GroupPeriod {
  groupId: string;
  groupName: string;
  validFrom: string;
  validTo: string | null;
  sharePct: number;
}

/**
 * Collapses legal-entity periods into one row per company group with contiguous periods
 * of equal share merged. Two entities of the same group (e.g. Det norske and Aker BP)
 * add up.
 */
export function groupPeriods(periods: LicenceShare[]): GroupPeriod[] {
  const boundaries = new Set<string>();
  for (const p of periods) {
    boundaries.add(p.validFrom);
    if (p.validTo) boundaries.add(p.validTo);
  }
  const cuts = [...boundaries].sort();
  const groups = new Map<string, string>();
  for (const p of periods) groups.set(p.groupId, p.groupName);

  const out: GroupPeriod[] = [];
  for (const [groupId, groupName] of groups) {
    let current: GroupPeriod | null = null;
    for (let i = 0; i < cuts.length; i++) {
      const from = cuts[i];
      if (from === undefined) continue;
      const to = cuts[i + 1] ?? null;
      const share = periods
        .filter(
          (p) =>
            p.groupId === groupId &&
            p.validFrom <= from &&
            (p.validTo === null || p.validTo > from),
        )
        .reduce((sum, p) => sum + p.sharePct, 0);
      const rounded = Math.round(share * 10_000) / 10_000;
      if (current && Math.abs(current.sharePct - rounded) < 1e-6) {
        current.validTo = to;
        continue;
      }
      if (current) out.push(current);
      current =
        rounded > 0
          ? { groupId, groupName, validFrom: from, validTo: to, sharePct: rounded }
          : null;
    }
    if (current) out.push(current);
  }
  return out;
}

export interface OwnershipEvent {
  date: string;
  groupName: string;
  fromPct: number;
  toPct: number;
}

/** Share changes per group, newest first: "2022-06-30 Aker BP 11.57% → 31.57%". */
export function ownershipEvents(periods: GroupPeriod[]): OwnershipEvent[] {
  const byGroup = new Map<string, GroupPeriod[]>();
  for (const p of periods) byGroup.set(p.groupId, [...(byGroup.get(p.groupId) ?? []), p]);
  const events: OwnershipEvent[] = [];
  const firstDate = periods.reduce<string | null>(
    (min, p) => (min === null || p.validFrom < min ? p.validFrom : min),
    null,
  );
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    let prev: GroupPeriod | null = null;
    for (const p of list) {
      const contiguous = prev && prev.validTo === p.validFrom;
      if (p.validFrom !== firstDate) {
        events.push({
          date: p.validFrom,
          groupName: p.groupName,
          fromPct: contiguous && prev ? prev.sharePct : 0,
          toPct: p.sharePct,
        });
      }
      prev = p;
    }
    const last = list[list.length - 1];
    if (last?.validTo) {
      events.push({
        date: last.validTo,
        groupName: last.groupName,
        fromPct: last.sharePct,
        toPct: 0,
      });
    }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
