import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useAnomalies } from '@/api/hooks';
import { useLanguageUrlSync } from '@/hooks/useLanguageUrlSync';
import { useUnitUrlSync } from '@/hooks/useUnitUrlSync';
import { useI18n } from '@/i18n/useI18n';
import { BottomTabs, MobileBar } from './BottomTabs';
import { Footer } from './Footer';
import { TopNav } from './TopNav';

function PageFallback() {
  const { m } = useI18n();
  return (
    <div
      className="mx-auto flex w-[min(1320px,calc(100%-32px))] flex-col gap-4 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{m.common.loadingPage}</span>
      <span className="skeleton h-3 w-24" />
      <span className="skeleton h-9 w-80 max-w-full" />
      <span className="skeleton mt-4 h-48 w-full rounded-[24px]" />
    </div>
  );
}

/** New page, new scroll position; unit or language changes (search params only) keep it. */
function useScrollToTopOnPathChange(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

export function AppShell() {
  const { m } = useI18n();
  useUnitUrlSync();
  useLanguageUrlSync();
  useScrollToTopOnPathChange();
  const [moreOpen, setMoreOpen] = useState(false);
  const anomalies = useAnomalies();
  // Only the newest month: the feed keeps two years of flags, all of them "new" to the
  // detector, and a count in the hundreds would be noise, not an alert.
  const newest = anomalies.data?.reduce((max, a) => (a.month > max ? a.month : max), '');
  const openAnomalies = anomalies.data?.filter(
    (a) => a.month === newest && (a.status === 'new' || a.status === 'investigating'),
  ).length;
  return (
    <div className="flex min-h-screen flex-col bg-bg pb-[84px] text-ink nav:pb-0">
      <a href="#main" className="btn sr-only-focusable fixed left-3 top-3 z-50">
        {m.nav.skip}
      </a>
      <TopNav openAnomalies={openAnomalies} />
      <MobileBar onOpenMore={() => setMoreOpen(true)} />
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
      <Footer />
      <BottomTabs moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
    </div>
  );
}
