/**
 * Calendar helpers. Sodir data is monthly and keyed by ISO dates ('2026-08-01'), so every
 * date here is handled in UTC to avoid the classic off-by-one-day bug in negative/positive
 * timezone offsets.
 */

const MS_PER_DAY = 86_400_000;

/** Parses 'YYYY-MM-DD' (or 'YYYY-MM') as a UTC date. */
export function parseIsoDate(iso: string): Date {
  const [y = '1970', m = '1', d = '1'] = iso.slice(0, 10).split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** First day of the month containing `iso`, as 'YYYY-MM-01'. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, n: number): string {
  const d = parseIsoDate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIsoDate(d);
}

export function addDays(iso: string, n: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + n * MS_PER_DAY));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / MS_PER_DAY);
}

export function daysInMonth(iso: string): number {
  const d = parseIsoDate(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Last day of the month, e.g. '2026-08-31'. */
export function monthEnd(iso: string): string {
  return `${iso.slice(0, 7)}-${String(daysInMonth(iso)).padStart(2, '0')}`;
}

/** Inclusive list of month starts from `from` to `to`. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface Quarter {
  year: number;
  /** 1..4 */
  q: number;
  /** First day, 'YYYY-MM-01' */
  start: string;
  /** Last day, 'YYYY-MM-DD' */
  end: string;
}

export function quarterOf(iso: string): Quarter {
  const d = parseIsoDate(iso);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  const start = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  return { year, q, start, end: monthEnd(addMonths(start, 2)) };
}

export function addQuarters(quarterStart: string, n: number): string {
  return addMonths(quarterStart, 3 * n);
}

export function daysInQuarter(quarterStart: string): number {
  const q = quarterOf(quarterStart);
  return diffDays(q.start, q.end) + 1;
}

/** The three month starts of the quarter beginning at `quarterStart`. */
export function quarterMonths(quarterStart: string): string[] {
  return [0, 1, 2].map((i) => addMonths(quarterStart, i));
}
