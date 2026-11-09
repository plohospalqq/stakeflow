import { useEffect, type ReactNode } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { FreshnessText } from './DataStatus';

interface PageProps {
  /** Small label above the title, e.g. "Companies" or a breadcrumb. */
  label: ReactNode;
  title: ReactNode;
  /** Plain-text title for the browser tab when `title` is not a string. */
  documentTitle?: string;
  /** Controls on the right of the header (switchers, CSV). */
  actions?: ReactNode;
  /** Shown under the title, e.g. status chips or a scope line. */
  meta?: ReactNode;
  /** Hide the "Sodir · through …" line (pages that state it themselves). */
  hideFreshness?: boolean;
  children: ReactNode;
}

/** Bento page frame: a big display title, its context, then the tiles. */
export function Page({
  label,
  title,
  documentTitle,
  actions,
  meta,
  hideFreshness,
  children,
}: PageProps) {
  const units = useUnits();
  const tabTitle = documentTitle ?? (typeof title === 'string' ? title : undefined);
  useEffect(() => {
    document.title = tabTitle ? `${tabTitle} · Stakeflow` : 'Stakeflow';
  }, [tabTitle]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-[min(1320px,calc(100%-32px))] flex-col gap-5 pb-12 pt-6 outline-none nav:pt-10"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-muted">{label}</span>
          <h1 className="display m-0 break-words text-[30px] font-bold leading-[1.08] tracking-[-0.035em] nav:text-h1">
            {title}
          </h1>
          {meta ? <div className="mt-1">{meta}</div> : null}
          {hideFreshness ? null : (
            <span className="lbl">
              <FreshnessText /> · {units.label}
            </span>
          )}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}
