import { NavLink } from 'react-router';
import { Icon } from '../Icon';
import { NAV_ITEMS } from './nav';

export function BottomTabs() {
  const tabs = NAV_ITEMS.filter((item) => item.tab);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface px-1 pt-1.5 nav:hidden"
      style={{
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      {tabs.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex min-h-[48px] flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${
              isActive ? 'text-ink' : 'text-muted'
            }`
          }
        >
          <Icon name={item.icon} size={18} />
          {item.tab}
        </NavLink>
      ))}
    </nav>
  );
}
