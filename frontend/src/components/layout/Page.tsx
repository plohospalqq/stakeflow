import { useEffect, type ReactNode } from 'react';
import { ThemeToggle } from '../ThemeToggle';
import { UnitToggle } from '../UnitToggle';
import { Logo } from './Logo';
import { FreshnessLine } from './FreshnessLine';

interface PageProps {
  /** Small label above the title, e.g. "Overview" or "Fields · North Sea". */
  label: ReactNode;
  title: ReactNode;
  /** Plain-text title for the browser tab when `title` is not a string. */
  documentTitle?: string;
  /** Extra controls left of the unit and theme toggles. */
  actions?: ReactNode;
  /** Shown under the title, e.g. status chips. */
  meta?: ReactNode;
  children: ReactNode;
}

export function Page({ label, title, documentTitle, actions, meta, children }: PageProps) {
  const tabTitle = documentTitle ?? (typeof title === 'string' ? title : undefined);
  useEffect(() => {
    document.title = tabTitle ? `${tabTitle} · Stakeflow` : 'Stakeflow';
  }, [tabTitle]);

  return (
    <>
      <header className="border-b border-line">
        <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-3 nav:hidden">
          <Logo compact />
          <div className="flex items-center gap-2 pr-2">
            <UnitToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 pb-4 pt-2 nav:px-8 nav:py-[18px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="lbl">{label}</span>
            <h1 className="m-0 text-h1">{title}</h1>
            {meta ? <div className="mt-2">{meta}</div> : null}
            <FreshnessLine className="mt-1 nav:hidden" />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {actions}
            <span className="hidden items-center gap-2.5 nav:flex">
              <UnitToggle />
              <ThemeToggle />
            </span>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-col gap-[22px] px-4 pb-8 pt-6 outline-none nav:px-8"
      >
        {children}
      </main>
    </>
  );
}
