/**
 * Number and date formatting in the active language. The language store calls
 * setFormatLocale() before it re-renders the app, so every formatter here follows the
 * EN · UK · NO switch without each call site passing a locale. Negative numbers use a real
 * minus sign (U+2212) so they line up with plus signs in tabular figures.
 */
import { parseIsoDate, quarterOf } from './dates';
import type { Unit } from './units';

export const MINUS = '−';

/** Words that wrap numbers and differ by language; they come from the dictionary. */
export interface FormatWords {
  /** e.g. 'Q{q} {year}', '{q} кв. {year}', '{q}. kv. {year}' */
  quarter: string;
  /** e.g. '${n} bn' */
  usdBn: string;
  /** e.g. '${n} m' */
  usdM: string;
}

const EN_WORDS: FormatWords = { quarter: 'Q{q} {year}', usdBn: '${n} bn', usdM: '${n} m' };

let locale = 'en-GB';
let words: FormatWords = EN_WORDS;

export function setFormatLocale(next: string, nextWords: FormatWords): void {
  locale = next;
  words = nextWords;
}

export function activeLocale(): string {
  return locale;
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `${locale}|n|${key}`;
  const hit = cache.get(id);
  if (hit instanceof Intl.NumberFormat) return hit;
  const nf = new Intl.NumberFormat(locale, options);
  cache.set(id, nf);
  return nf;
}
function dateFormat(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${locale}|d|${key}`;
  const hit = cache.get(id);
  if (hit instanceof Intl.DateTimeFormat) return hit;
  const df = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
  cache.set(id, df);
  return df;
}

function withMinus(text: string): string {
  return text.replace('-', MINUS);
}

/** Ukrainian adds ' р.' (year) after dates; in a UI label it is noise. */
function tidyDate(text: string): string {
  return text.replace(/\s?р\.$/, '').replace('Sept', 'Sep');
}

export function formatNumber(value: number, digits = 0): string {
  return withMinus(
    numberFormat(`f${digits}`, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value),
  );
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

/** Percentage from a value already in percent (2.1 → '2.1%'; Norwegian writes '2,1 %'). */
export function formatPct(value: number, digits = 1, signed = false): string {
  return withMinus(
    numberFormat(`p${digits}${signed ? 's' : ''}`, {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(value / 100),
  );
}

/** Percentage from a fraction (0.021 → '2.1%'). */
export function formatShare(fraction: number, digits = 0): string {
  return formatPct(fraction * 100, digits);
}

export function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}`;
}

/** Large counts in words: 4,216,104 → '4.22 million' ('4,22 millioner', '4,22 мільйона'). */
export function formatCompactLong(value: number, digits = 2): string {
  return numberFormat(`cl${digits}`, {
    notation: 'compact',
    compactDisplay: 'long',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** '2026-08-01' → 'Aug 2026' */
export function formatMonth(iso: string): string {
  return tidyDate(dateFormat('my', { month: 'short', year: 'numeric' }).format(parseIsoDate(iso)));
}

/** '2026-08-01' → 'August 2026' */
export function formatMonthLong(iso: string): string {
  return tidyDate(dateFormat('MY', { month: 'long', year: 'numeric' }).format(parseIsoDate(iso)));
}

/** '2026-08-01' → 'Aug' */
export function formatMonthName(iso: string): string {
  return tidyDate(dateFormat('m', { month: 'short' }).format(parseIsoDate(iso)));
}

/** '2026-08-01' → 'August' */
export function formatMonthNameLong(iso: string): string {
  return tidyDate(dateFormat('M', { month: 'long' }).format(parseIsoDate(iso)));
}

/** '2025-08-01' → 'Aug 25', used for compact "vs same month last year" labels. */
export function formatMonthShort(iso: string): string {
  return `${formatMonthName(iso)} ${iso.slice(2, 4)}`;
}

/** '2026-10-14' → '14 Oct 2026' */
export function formatDate(iso: string): string {
  return tidyDate(
    dateFormat('dmy', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      parseIsoDate(iso),
    ),
  );
}

/** '2026-10-14' → '14 Oct' */
export function formatDayMonth(iso: string): string {
  return tidyDate(dateFormat('dm', { day: 'numeric', month: 'short' }).format(parseIsoDate(iso)));
}

/** '2026-07-01' → 'Q3 2026' */
export function formatQuarter(iso: string): string {
  const q = quarterOf(iso);
  return words.quarter.replace('{q}', String(q.q)).replace('{year}', String(q.year));
}

/** 'Q3 2026' → 'Q3 26' for tight axis labels. */
export function formatQuarterShort(iso: string): string {
  const q = quarterOf(iso);
  return words.quarter.replace('{q}', String(q.q)).replace('{year}', String(q.year).slice(2));
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
  if (abs >= 1e9) return words.usdBn.replace('{n}', formatNumber(value / 1e9, 2));
  if (abs >= 1e6) return words.usdM.replace('{n}', formatNumber(value / 1e6, 0));
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
