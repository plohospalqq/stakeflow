/**
 * "Say it in words": one generated sentence per company card explaining the latest
 * month-on-month change by the field that moved most.
 */
import type { CompanyFieldMonthly } from '@/api/types';
import { formatMonthName, formatNumber, MINUS } from './format';

export interface FieldMove {
  fieldName: string;
  /** Change in the display unit (latest − previous). */
  change: number;
}

function signed(value: number, digits: number): string {
  const text = formatNumber(Math.abs(value), digits);
  return value < 0 ? `${MINUS}${text}` : `+${text}`;
}

/** Per-field change between the previous and the latest month, largest move first. */
export function fieldMoves(
  rows: CompanyFieldMonthly[],
  latestMonth: string,
  previousMonth: string,
  toDisplay: (sm3: number, month: string) => number,
): FieldMove[] {
  const byField = new Map<string, { latest: number; previous: number }>();
  for (const r of rows) {
    if (r.month !== latestMonth && r.month !== previousMonth) continue;
    const entry = byField.get(r.fieldName) ?? { latest: 0, previous: 0 };
    if (r.month === latestMonth) entry.latest += toDisplay(r.oeSm3, r.month);
    else entry.previous += toDisplay(r.oeSm3, r.month);
    byField.set(r.fieldName, entry);
  }
  return [...byField.entries()]
    .map(([fieldName, v]) => ({ fieldName, change: v.latest - v.previous }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/**
 * e.g. "Down 4.7 kboe/d on Jul, mostly Johan Sverdrup (−3.1)." or, when the biggest single
 * move went the other way, "Down 4.7 kboe/d on Jul despite Valhall (+4.5); Alvheim fell
 * the most (−3.6)."
 */
export function explainChange(
  moves: FieldMove[],
  previousMonth: string,
  unitLabel: string,
  digits = 1,
): string | null {
  if (moves.length === 0) return null;
  const total = moves.reduce((s, m) => s + m.change, 0);
  const prevName = formatMonthName(previousMonth);
  const [top] = moves;
  if (!top) return null;
  const totalAbs = Math.abs(total);
  const scale = Math.max(...moves.map((m) => Math.abs(m.change)), totalAbs) || 1;
  if (totalAbs < scale * 0.05 && Math.abs(top.change) < 0.05) {
    return `Flat on ${prevName}; no field moved by more than ${formatNumber(0.05, 2)} ${unitLabel}.`;
  }
  const direction = total >= 0 ? 'Up' : 'Down';
  const head = `${direction} ${formatNumber(totalAbs, digits)} ${unitLabel} on ${prevName}`;
  if (Math.sign(top.change) === Math.sign(total) || total === 0) {
    return `${head}, mostly ${top.fieldName} (${signed(top.change, digits)}).`;
  }
  const despite = `${head} despite ${top.fieldName} (${signed(top.change, digits)})`;
  const driver = moves.find((m) => Math.sign(m.change) === Math.sign(total));
  if (!driver) return `${despite}.`;
  const verb = total < 0 ? 'fell' : 'rose';
  return `${despite}; ${driver.fieldName} ${verb} the most (${signed(driver.change, digits)}).`;
}
