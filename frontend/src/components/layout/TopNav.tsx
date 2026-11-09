import { useId, useState } from 'react';
import { NavLink } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from '../Icon';
import { POPOVER_CLASS, useDismiss } from '../popover';
import { LanguageSwitch, ModeSwitch } from '../settings/PreferenceControls';
import { ThemeToggle } from '../ThemeToggle';
import { UnitToggle } from '../UnitToggle';
import { Logo } from './Logo';
import { NAV_ITEMS } from './nav';

/** The four preferences, stacked (popover, sheet) or in a row (wide nav). */
export function Preferences({
  stacked,
  withLanguage = true,
}: {
  stacked: boolean;
  withLanguage?: boolean;
}) {
  const { m } = useI18n();
  if (!stacked) {
    return (
      <div className="flex items-center gap-1.5">
        <ModeSwitch />
        <UnitToggle />
        <LanguageSwitch />
        <ThemeToggle />
      </div>
    );
  }
  const row = 'flex flex-wrap items-center justify-between gap-3';
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="cap">{m.settings.mode}</span>
        <ModeSwitch />
        <span className="lbl">{m.settings.modeHint}</span>
      </div>
      <div className={row}>
        <span className="cap">{m.settings.units}</span>
        <UnitToggle />
      </div>
      {withLanguage ? (
        <div className={row}>
          <span className="cap">{m.settings.language}</span>
          <LanguageSwitch />
        </div>
      ) : null}
      <div className={row}>
        <span className="cap">{m.settings.theme}</span>
        <ThemeToggle />
      </div>
    </div>
  );
}

function PreferencesButton() {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const { root, button } = useDismiss(open, () => setOpen(false));
  return (
    <span ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="ibtn h-9 w-9 bg-transparent"
        aria-label={m.nav.settings}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sliders" />
      </button>
      {open ? (
        <div id={id} className={`${POPOVER_CLASS} right-0 w-[300px]`}>
          <Preferences stacked withLanguage={false} />
        </div>
      ) : null}
    </span>
  );
}

/**
 * Desktop navigation: a floating glass pill. Sections in the middle; the preferences sit
 * inline on wide screens and behind one button below 1280px, where they would not fit.
 */
export function TopNav({ openAnomalies }: { openAnomalies?: number }) {
  const { m, t } = useI18n();
  return (
    <header className="sticky top-3 z-30 mx-auto hidden w-[min(1320px,calc(100%-32px))] nav:block">
      <nav
        aria-label={m.nav.main}
        className="glass flex items-center gap-1 rounded-full py-1.5 pl-4 pr-2"
      >
        <Logo />
        <ul className="m-0 ml-3 flex min-w-0 flex-1 list-none items-center gap-0.5 p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] font-medium no-underline transition-colors ${
                    isActive ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'
                  }`
                }
              >
                {m.nav[item.label]}
                {item.badge === 'anomalies' && openAnomalies ? (
                  // Anomalies are sample data for now; the count must not pass for a live alert.
                  <span
                    className="num rounded-full border border-dashed border-line-strong px-1.5 text-[11px] leading-[16px]"
                    aria-label={t(m.nav.openAnomalies, { n: openAnomalies })}
                    title={m.nav.openAnomaliesTitle}
                  >
                    {openAnomalies}
                  </span>
                ) : null}
                {item.badge === 'beta' ? (
                  <span className="rounded-full bg-surface3 px-1.5 text-[10.5px] font-semibold uppercase leading-[16px] tracking-[0.04em] text-muted">
                    {m.nav.beta}
                  </span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="hidden min-[1400px]:block">
          <Preferences stacked={false} />
        </div>
        <div className="flex items-center gap-1 min-[1400px]:hidden">
          <LanguageSwitch />
          <PreferencesButton />
        </div>
      </nav>
    </header>
  );
}
