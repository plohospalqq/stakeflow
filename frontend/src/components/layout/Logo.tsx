import { Link } from 'react-router';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" className="flex-none">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--sf2)" stroke="var(--bd2)" />
      <path d="M7 20h14" stroke="var(--fa)" strokeWidth="1.5" />
      <path
        d="M9 17v-5M12.5 17V8M16 17v-3M19.5 17v-6"
        stroke="var(--oil)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="flex min-h-[44px] items-center gap-2.5 rounded-control px-2.5 text-ink no-underline"
      aria-label="Stakeflow home"
    >
      <LogoMark />
      <span className="flex flex-col leading-tight">
        <span className="text-[14px] font-bold">Stakeflow</span>
        {compact ? null : (
          <span className="text-[11px] text-muted">NCS production intelligence</span>
        )}
      </span>
    </Link>
  );
}
