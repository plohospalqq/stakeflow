/**
 * "Say it in words": one generated sentence explaining the latest month-on-month change of
 * a company by the field that moved most. The sentence templates come from the dictionary.
 */
import type { CompanyFieldMonthly } from '@/api/types';
import { formatNumber, MINUS } from './format';

export interface FieldMove {
  fieldName: string;
  /** Change in the display unit (latest − previous). */
  change: number;
}

/** The dictionary's explain section (kept structural so lib/ does not import i18n). */
export interface ExplainWords {
  flat: string;
  upMostly: string;
  downMostly: string;
  upDespite: string;
  downDespite: string;
  rose: string;
  fell: string;
}

function signed(value: number, digits: number): string {
  const text = formatNumber(Math.abs(value), digits);
  return value < 0 ? `${MINUS}${text}` : `+${text}`;
}

function fillIn(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
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
  previousMonthName: string,
  unitLabel: string,
  words: ExplainWords,
  digits = 1,
): string | null {
  const [top] = moves;
  if (!top) return null;
  const total = moves.reduce((s, m) => s + m.change, 0);
  const totalAbs = Math.abs(total);
  const scale = Math.max(...moves.map((m) => Math.abs(m.change)), totalAbs) || 1;
  const base = { n: formatNumber(totalAbs, digits), unit: unitLabel, month: previousMonthName };
  if (totalAbs < scale * 0.05 && Math.abs(top.change) < 0.05) {
    return fillIn(words.flat, { ...base, n: formatNumber(0.05, 2) });
  }
  const up = total >= 0;
  const topVars = { ...base, field: top.fieldName, change: signed(top.change, digits) };
  if (Math.sign(top.change) === Math.sign(total) || total === 0) {
    return fillIn(up ? words.upMostly : words.downMostly, topVars);
  }
  const despite = fillIn(up ? words.upDespite : words.downDespite, topVars);
  const driver = moves.find((m) => Math.sign(m.change) === Math.sign(total));
  if (!driver) return `${despite}.`;
  return (
    despite +
    fillIn(up ? words.rose : words.fell, {
      field: driver.fieldName,
      change: signed(driver.change, digits),
    })
  );
}
