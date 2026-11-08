/**
 * Number and date formatting. Negative numbers use a real minus sign (U+2212) so they
 * line up with plus signs in tabular mono text.
 */
import { parseIsoDate, quarterOf } from './dates';
import type { Unit } from './units';

export const MINUS = '−';

const nf = (digits: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function withMinus(text: string): string {
  return text.replace('-', MINUS);
}

export function formatNumber(value: number, digits = 0): string {
  return withMinus(nf(digits).format(value));
}

/**
 * A volume in the display unit. Big numbers drop decimals (1,382), small ones keep
 * enough precision to be useful (98.4, 0.412).
 */
export function formatVolume(value: number, unit: Unit, digits?: number): string {
  if (digits !== undefined) return formatNumber(value, digits);
  const abs = Math.abs(value);
  if (unit === 'boe') return formatNumber(value, abs >= 100 ? 0 : 1);
  return formatNumber(value, abs < 1 ? 3 : 2);
}

/** Percentage from a value already in percent (2.1 → '2.1%'). */
export function formatPct(value: number, digits = 1, signed = false): string {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, digits)}%`;
}

/** Percentage from a fraction (0.021 → '2.1%'). */
export function formatShare(fraction: number, digits = 0): string {
  return formatPct(fraction * 100, digits);
}

export function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}`;
}

const monthLong = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthOnly = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const fullMonth = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** '2026-08-01' → 'Aug 2026' */
export function formatMonth(iso: string): string {
  return monthLong.format(parseIsoDate(iso)).replace('Sept', 'Sep');
}

/** '2026-08-01' → 'August 2026' */
export function formatMonthLong(iso: string): string {
  return fullMonth.format(parseIsoDate(iso));
}

/** '2026-08-01' → 'Aug' */
export function formatMonthName(iso: string): string {
  return monthOnly.format(parseIsoDate(iso)).replace('Sept', 'Sep');
}

/** '2025-08-01' → 'Aug 25', used for compact "vs same month last year" labels. */
export function formatMonthShort(iso: string): string {
  return `${formatMonthName(iso)} ${iso.slice(2, 4)}`;
}

/** '2026-10-14' → '14 Oct 2026' */
export function formatDate(iso: string): string {
  return dayMonthYear.format(parseIsoDate(iso)).replace('Sept', 'Sep');
}

/** '2026-07-01' → 'Q3 2026' */
export function formatQuarter(iso: string): string {
  const q = quarterOf(iso);
  return `Q${q.q} ${q.year}`;
}

/** ISO timestamp → '2026-09-30 23:59 UTC' (predictions are timestamped in UTC). */
export function formatUtc(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** USD amounts in millions or billions: 1_234_000_000 → '$1.23 bn'. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${formatNumber(value / 1e9, 2)} bn`;
  if (abs >= 1e6) return `$${formatNumber(value / 1e6, 0)} m`;
  return `$${formatNumber(value, 0)}`;
}

const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;

/**
 * Sodir publishes field names in capitals ('JOHAN SVERDRUP'). Title case reads better
 * in a UI; roman numerals stay upper case ('TOR II' → 'Tor II').
 */
export function titleCaseName(name: string): string {
  return name
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (ROMAN.test(part)) return part;
      const lower = part.toLocaleLowerCase('nb-NO');
      return lower.charAt(0).toLocaleUpperCase('nb-NO') + lower.slice(1);
    })
    .join('');
}
