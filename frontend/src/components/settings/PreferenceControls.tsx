import { useLocation, useNavigate } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import type { Lang } from '@/i18n/types';
import { LANG_PARAM, useLangStore } from '@/stores/language';
import { useModeStore } from '@/stores/mode';
import type { Mode } from '@/i18n/text';
import { SegmentedControl } from '../SegmentedControl';

const LANG_OPTIONS: { value: Lang; code: string }[] = [
  { value: 'en', code: 'EN' },
  { value: 'uk', code: 'UK' },
  { value: 'nb', code: 'NO' },
];

/** EN · UK · NO. A ?lang= in the address is kept in step so a copied link opens the same way. */
export function LanguageSwitch() {
  const { m, lang } = useI18n();
  const setLang = useLangStore((s) => s.setLang);
  const location = useLocation();
  const navigate = useNavigate();

  const change = (next: Lang) => {
    setLang(next);
    const params = new URLSearchParams(location.search);
    if (!params.has(LANG_PARAM)) return;
    params.set(LANG_PARAM, next);
    void navigate(
      { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
      { replace: true, preventScrollReset: true },
    );
  };

  return (
    <SegmentedControl
      size="sm"
      label={m.settings.language}
      value={lang}
      onChange={change}
      options={LANG_OPTIONS.map((o) => ({
        value: o.value,
        label: o.code,
        // Each language names itself, in its own language, for screen readers.
        ariaLabel: m.settings.langNames[o.value],
        lang: o.value,
      }))}
    />
  );
}

/** Simple words / Expert. `compact` shows "Simple" in the navigation, the full name to screen readers. */
export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const { m } = useI18n();
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);
  const options: { value: Mode; label: string; ariaLabel?: string }[] = [
    {
      value: 'simple',
      label: compact ? m.settings.simpleShort : m.settings.simple,
      ariaLabel: compact ? m.settings.simple : undefined,
    },
    { value: 'expert', label: m.settings.expert },
  ];
  return (
    <SegmentedControl
      size="sm"
      label={m.settings.mode}
      value={mode}
      onChange={setMode}
      options={options}
    />
  );
}
