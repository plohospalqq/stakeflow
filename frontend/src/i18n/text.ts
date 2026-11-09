/**
 * The three things a dictionary entry can need at runtime: placeholders ({name}), plural
 * choice (Intl.PluralRules with the active locale) and the simple/expert variant.
 */
import { formatNumber } from '@/lib/format';
import type { Lang, Plural, Variant } from './types';

export const LOCALES: Record<Lang, string> = { en: 'en-GB', uk: 'uk-UA', nb: 'nb-NO' };

export type Vars = Record<string, string | number>;

/** 'Up {n} on {month}' + { n: 4, month: 'Jul' } → 'Up 4 on Jul'. Unknown names stay visible. */
export function fill(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

const rulesCache = new Map<string, Intl.PluralRules>();
function rules(lang: Lang): Intl.PluralRules {
  let r = rulesCache.get(lang);
  if (!r) {
    r = new Intl.PluralRules(LOCALES[lang]);
    rulesCache.set(lang, r);
  }
  return r;
}

/** Picks the plural form for n and fills {n} with the locale-formatted number. */
export function pluralize(lang: Lang, forms: Plural, n: number, vars: Vars = {}): string {
  const category = rules(lang).select(n);
  const template =
    category === 'one'
      ? forms.one
      : category === 'few'
        ? (forms.few ?? forms.other)
        : category === 'many'
          ? (forms.many ?? forms.other)
          : forms.other;
  const digits = Number.isInteger(n) ? 0 : 1;
  return fill(template, { n: formatNumber(n, digits), ...vars });
}

export type Mode = 'simple' | 'expert';

export function pick(variant: Variant, mode: Mode): string {
  return variant[mode];
}

/** Placeholder names used in a template, for the dictionary parity test. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

/** Plain text of a dictionary string with <b> removed, for aria-labels and titles. */
export function plainText(text: string, vars?: Vars): string {
  return fill(text.replace(/<\/?b>/g, ''), vars);
}
