/**
 * Types for the dictionaries. English (en.ts) is the source of truth; every other language
 * is typed as Dict, so a missing or extra key is a compile error, not a blank on screen.
 */
import type { en } from './en';

export type Lang = 'en' | 'uk' | 'nb';

export const LANGS: readonly Lang[] = ['en', 'uk', 'nb'];

/**
 * Plural forms as Intl.PluralRules names them. English and Norwegian use one/other;
 * Ukrainian also needs few (2–4) and many (5–20); a test checks every language has the
 * forms its rules ask for.
 */
export interface Plural {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

/** Copy that differs between "Simple words" and "Expert" mode. */
export interface Variant {
  simple: string;
  expert: string;
}

/** True when an object has no keys beyond those of Shape (so { simple, expert, units } is not a Variant). */
type Only<T, Shape> = [Exclude<keyof T, keyof Shape>] extends [never] ? true : false;

type Shape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Plural
      ? Only<T[K], Plural> extends true
        ? Plural
        : Shape<T[K]>
      : T[K] extends Variant
        ? Only<T[K], Variant> extends true
          ? Variant
          : Shape<T[K]>
        : Shape<T[K]>;
};

export type Dict = Shape<typeof en>;
