import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { LANG_PARAM, parseLang, useLangStore } from '@/stores/language';

/** A ?lang= reached by navigation (pasted link, back button) wins over the stored choice. */
export function useLanguageUrlSync(): void {
  const { search } = useLocation();
  useEffect(() => {
    const fromUrl = parseLang(new URLSearchParams(search).get(LANG_PARAM));
    const { lang, setLang } = useLangStore.getState();
    if (fromUrl && fromUrl !== lang) setLang(fromUrl);
  }, [search]);
}
