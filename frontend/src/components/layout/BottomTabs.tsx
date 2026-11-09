import { useCallback } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { Logo } from './Logo';
import { NAV_ITEMS } from './nav';
import { Preferences } from './TopNav';

/** Phone top bar: the logo and the display settings, which live in the "More" sheet. */
export function MobileBar({ onOpenMore }: { onOpenMore: () => void }) {
  const { m } = useI18n();
  return (
    <header
      className="glass sticky top-0 z-30 flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-1 shadow-none nav:hidden"
      style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
    >
      <Logo />
      <button
        type="button"
        className="ibtn bg-transparent"
        aria-label={m.nav.settings}
        onClick={onOpenMore}
      >
        <Icon name="sliders" />
      </button>
    </header>
  );
}

/** Bottom tab bar on phones: four sections and "More" for the rest and the settings. */
export function BottomTabs({
  moreOpen,
  setMoreOpen,
}: {
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
}) {
  const { m } = useI18n();
  const { pathname } = useLocation();
  const tabs = NAV_ITEMS.filter((item) => item.tab);
  const rest = NAV_ITEMS.filter((item) => !item.tab);
  const inMore = rest.some((item) => pathname.startsWith(item.to));
  const close = useCallback(() => setMoreOpen(false), [setMoreOpen]);
  const tabClass = (active: boolean) =>
    `flex min-h-[50px] flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] font-medium no-underline ${
      active ? 'text-ink' : 'text-muted'
    }`;

  return (
    <>
      <nav
        aria-label={m.nav.main}
        className="glass fixed inset-x-0 bottom-0 z-30 grid rounded-none border-x-0 border-b-0 px-1 pt-1 shadow-none nav:hidden"
        style={{
          gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {tabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => tabClass(isActive)}
          >
            <Icon name={item.icon} size={21} />
            {item.tab ? m.nav[item.tab] : m.nav[item.label]}
          </NavLink>
        ))}
        <button
          type="button"
          className={tabClass(inMore || moreOpen)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" size={21} />
          {m.nav.more}
        </button>
      </nav>
      <Sheet open={moreOpen} title={m.nav.moreTitle} onClose={close}>
        <ul className="m-0 mb-5 grid list-none grid-cols-2 gap-2 p-0">
          {rest.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  `flex min-h-[52px] items-center gap-2.5 rounded-2xl px-3.5 text-[15px] font-medium no-underline ${
                    isActive ? 'bg-surface3 text-ink' : 'bg-surface2 text-ink'
                  }`
                }
              >
                <Icon name={item.icon} />
                {m.nav[item.label]}
              </NavLink>
            </li>
          ))}
        </ul>
        <Preferences stacked />
      </Sheet>
    </>
  );
}
