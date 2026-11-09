import { create } from 'zustand';
import { DICTS } from '@/i18n/dicts';
import { LOCALES } from '@/i18n/text';
import type { Lang } from '@/i18n/types';
import { setFormatLocale } from '@/lib/format';
import { readStorage, writeStorage } from '@/lib/storage';

export const LANG_STORAGE_KEY = 'stakeflow-lang';
export const LANG_PARAM = 'lang';

/** Accepts our codes and the ones browsers and people actually type ('no', 'nb-NO', 'uk-UA'). */
export function parseLang(raw: string | null | undefined): Lang | null {
  if (!raw) return null;
  const code = raw.toLowerCase().split(/[-_]/)[0];
  if (code === 'en') return 'en';
  if (code === 'uk') return 'uk';
  if (code === 'nb' || code === 'no' || code === 'nn') return 'nb';
  return null;
}

/** ?lang= first (a shared link), then the reader's earlier choice, then the browser. */
export function detectLanguage(): Lang {
  const fromUrl = parseLang(new URLSearchParams(window.location.search).get(LANG_PARAM));
  if (fromUrl) return fromUrl;
  const saved = parseLang(readStorage(LANG_STORAGE_KEY));
  if (saved) return saved;
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const lang = parseLang(candidate);
    if (lang) return lang;
  }
  return 'en';
}

/** Formatters and <html lang> switch before React re-renders, so no frame shows a mix. */
function applyLang(lang: Lang): void {
  setFormatLocale(LOCALES[lang], DICTS[lang].format);
  document.documentElement.lang = lang;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const initial = detectLanguage();
applyLang(initial);

export const useLangStore = create<LangState>((set) => ({
  lang: initial,
  setLang: (lang) => {
    applyLang(lang);
    writeStorage(LANG_STORAGE_KEY, lang);
    set({ lang });
  },
}));
