import { useI18n } from '@/i18n/useI18n';
import { useThemeStore } from '@/stores/theme';
import { Icon } from './Icon';

export function ThemeToggle({ className }: { className?: string }) {
  const { m } = useI18n();
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className={`ibtn h-9 w-9 bg-transparent max-nav:h-11 max-nav:w-11 ${className ?? ''}`}
      aria-label={m.settings.darkMode}
      aria-pressed={isDark}
      title={isDark ? m.settings.toLight : m.settings.toDark}
      onClick={toggle}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}
