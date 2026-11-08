import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Icon } from '../Icon';
import { Logo } from './Logo';
import { NAV_ITEMS } from './nav';

interface SidebarProps {
  /** Number shown next to "Anomalies"; hidden while unknown. */
  openAnomalies?: number;
  status: ReactNode;
}

export function Sidebar({ openAnomalies, status }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] flex-none flex-col gap-[22px] overflow-y-auto border-r border-line px-3 py-5 nav:flex">
      <Logo />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 font-medium no-underline ${
                isActive ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
            {item.badge === 'anomalies' && openAnomalies ? (
              <span className="chip num ml-auto px-1.5" aria-label={`${openAnomalies} open`}>
                {openAnomalies}
              </span>
            ) : null}
            {item.badge === 'beta' ? (
              <span className="chip ml-auto px-1.5 text-[11px]">Beta</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">{status}</div>
    </aside>
  );
}
