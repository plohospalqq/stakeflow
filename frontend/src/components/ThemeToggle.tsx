import { useThemeStore } from '@/stores/theme';
import { Icon } from './Icon';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="ibtn max-nav:h-11 max-nav:w-11"
      aria-label="Dark mode"
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}
