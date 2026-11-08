import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useUnitUrlSync } from '@/hooks/useUnitUrlSync';
import { BottomTabs } from './BottomTabs';
import { DataStatusCard } from './DataStatus';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';

function PageFallback() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 nav:px-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <span className="skeleton h-3 w-24" />
      <span className="skeleton h-6 w-72 max-w-full" />
      <span className="skeleton mt-4 h-40 w-full" />
    </div>
  );
}

/** New page, new scroll position; unit changes (search params only) keep the scroll. */
function useScrollToTopOnPathChange(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

export function AppShell() {
  useUnitUrlSync();
  useScrollToTopOnPathChange();
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <a href="#main" className="btn sr-only-focusable fixed left-2 top-2 z-50">
        Skip to content
      </a>
      <Sidebar status={<DataStatusCard latestMonth={undefined} />} />
      <div className="flex min-w-0 flex-1 flex-col pb-[76px] nav:pb-0">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
        <Footer />
      </div>
      <BottomTabs />
    </div>
  );
}
