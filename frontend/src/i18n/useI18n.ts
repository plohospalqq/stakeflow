import { useMemo } from 'react';
import { useLangStore } from '@/stores/language';
import { useModeStore } from '@/stores/mode';
import { DICTS } from './dicts';
import { fill, LOCALES, pluralize, type Mode, type Vars } from './text';
import type { Dict, Lang, Plural, Variant } from './types';

export interface I18n {
  lang: Lang;
  /** BCP 47 locale for Intl, e.g. 'nb-NO'. */
  locale: string;
  mode: Mode;
  simple: boolean;
  /** The active dictionary: m.nav.map, m.company.title… */
  m: Dict;
  /** Fills {placeholders}. */
  t: (template: string, vars?: Vars) => string;
  /** Plural form for n, with {n} filled in. */
  plural: (forms: Plural, n: number, vars?: Vars) => string;
  /** Simple-words or expert copy, by the active mode. */
  v: (variant: Variant, vars?: Vars) => string;
}

/** Everything a component needs to speak the reader's language and level. */
export function useI18n(): I18n {
  const lang = useLangStore((s) => s.lang);
  const mode = useModeStore((s) => s.mode);
  return useMemo(
    () => ({
      lang,
      locale: LOCALES[lang],
      mode,
      simple: mode === 'simple',
      m: DICTS[lang],
      t: fill,
      plural: (forms, n, vars) => pluralize(lang, forms, n, vars),
      v: (variant, vars) => fill(variant[mode], vars),
    }),
    [lang, mode],
  );
}
