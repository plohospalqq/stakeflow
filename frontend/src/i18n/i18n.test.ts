import { afterEach, describe, expect, it } from 'vitest';
import { detectLanguage, parseLang } from '@/stores/language';
import { DICTS } from './dicts';
import { en } from './en';
import { fill, LOCALES, placeholders, pluralize } from './text';
import { LANGS, type Lang } from './types';

type Leaf = string | Record<string, string>;

const PLURAL_KEYS = ['one', 'few', 'many', 'other'];
const VARIANT_KEYS = ['simple', 'expert'];

function isLeafObject(value: Record<string, unknown>): value is Record<string, string> {
  const keys = Object.keys(value);
  const all = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  return keys.every((k) => typeof value[k] === 'string') && (all(PLURAL_KEYS) || all(VARIANT_KEYS));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Every leaf of a dictionary by its dotted path. */
function leaves(dict: unknown, prefix = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  if (!isRecord(dict)) return out;
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (isRecord(value) && isLeafObject(value)) out.set(path, value);
    else for (const [p, v] of leaves(value, path)) out.set(p, v);
  }
  return out;
}

const textsOf = (leaf: Leaf): string[] => (typeof leaf === 'string' ? [leaf] : Object.values(leaf));
const placeholderSet = (leaf: Leaf) => [...new Set(textsOf(leaf).flatMap(placeholders))].sort();
const boldCount = (text: string) => (text.match(/<b>/g) ?? []).length;

const source = leaves(en);

describe.each(LANGS.filter((l) => l !== 'en'))('dictionary %s', (lang) => {
  const dict = leaves(DICTS[lang]);

  it('has exactly the keys of the English source', () => {
    expect([...dict.keys()].sort()).toEqual([...source.keys()].sort());
  });

  it('keeps every placeholder and every bold span', () => {
    for (const [path, leaf] of source) {
      const other = dict.get(path);
      if (other === undefined) continue;
      expect([path, placeholderSet(other)]).toEqual([path, placeholderSet(leaf)]);
      if (typeof leaf === 'string' && typeof other === 'string') {
        expect([path, boldCount(other)]).toEqual([path, boldCount(leaf)]);
      }
    }
  });

  it('has every plural form its language needs', () => {
    const needed = new Intl.PluralRules(LOCALES[lang]).resolvedOptions().pluralCategories;
    for (const [path, leaf] of dict) {
      if (typeof leaf === 'string' || !('one' in leaf)) continue;
      for (const category of needed) {
        expect([path, category, typeof leaf[category]]).toEqual([path, category, 'string']);
      }
    }
  });

  it('keeps the full Equinor scope label', () => {
    const name = DICTS[lang].companyMeta.equinorName;
    expect(name.startsWith('Equinor (')).toBe(true);
    expect(name).not.toBe(en.companyMeta.equinorName);
  });
});

describe('plurals', () => {
  const uk = { one: '{n} поле', few: '{n} поля', many: '{n} полів', other: '{n} поля' };

  it('uses one/few/many in Ukrainian', () => {
    expect(pluralize('uk', uk, 1)).toBe('1 поле');
    expect(pluralize('uk', uk, 3)).toBe('3 поля');
    expect(pluralize('uk', uk, 5)).toBe('5 полів');
    expect(pluralize('uk', uk, 11)).toBe('11 полів');
    expect(pluralize('uk', uk, 21)).toBe('21 поле');
    expect(pluralize('uk', uk, 94)).toBe('94 поля');
  });

  it('uses one/other in English and Norwegian', () => {
    const forms = { one: '{n} field', other: '{n} fields' };
    expect(pluralize('en', forms, 1)).toBe('1 field');
    expect(pluralize('en', forms, 94)).toBe('94 fields');
    expect(pluralize('nb', { one: '{n} måned', other: '{n} måneder' }, 2)).toBe('2 måneder');
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});

describe('language detection', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('understands the codes people and browsers use', () => {
    expect(parseLang('uk-UA')).toBe('uk');
    expect(parseLang('no')).toBe('nb');
    expect(parseLang('nn-NO')).toBe('nb');
    expect(parseLang('EN')).toBe('en');
    expect(parseLang('ru')).toBeNull();
  });

  it('prefers ?lang= over the saved choice, and the saved choice over the browser', () => {
    window.localStorage.setItem('stakeflow-lang', 'nb');
    expect(detectLanguage()).toBe('nb');
    window.history.replaceState(null, '', '/?lang=uk');
    expect(detectLanguage()).toBe('uk');
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    // jsdom's browser language is English.
    expect(detectLanguage()).toBe<Lang>('en');
  });
});
