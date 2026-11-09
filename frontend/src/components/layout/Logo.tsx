import { Link } from 'react-router';
import { useI18n } from '@/i18n/useI18n';

/** Three rising bars in the product colours: oil, gas, NGL. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" className="flex-none">
      <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="var(--tx)" />
      <path d="M8.5 19.5v-5" stroke="var(--cnd)" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 19.5V8.5" stroke="var(--oil)" strokeWidth="3" strokeLinecap="round" />
      <path d="M19.5 19.5v-8" stroke="var(--gas)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  const { m } = useI18n();
  return (
    <Link
      to="/"
      className="flex min-h-[44px] flex-none items-center gap-2 rounded-full pr-1 text-ink no-underline"
      aria-label={m.nav.logoLabel}
    >
      <LogoMark />
      <span className="display text-[16px] font-semibold tracking-[-0.02em]">Stakeflow</span>
    </Link>
  );
}
