import { useEffect } from 'react';
import { useSummary } from '@/api/hooks';
import { ErrorState } from '@/components/ErrorState';
import { useI18n } from '@/i18n/useI18n';
import { Facts } from './home/Facts';
import { Glance } from './home/Glance';
import { Hero } from './home/Hero';
import { HowItWorks } from './home/HowItWorks';
import { Race } from './home/Race';
import { TrackStory } from './home/TrackStory';

/**
 * The landing page as a keynote: one idea per screen for newcomers and recruiters (the
 * giant number, three facts, the race, how it works, the honest record), then
 * a dense bento of the same data for analysts.
 */
export default function Home() {
  const { m } = useI18n();
  const summary = useSummary();
  useEffect(() => {
    document.title = 'Stakeflow';
  }, []);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-[min(1240px,calc(100%-32px))] flex-col outline-none"
    >
      {summary.isError ? (
        <div className="pt-16">
          <ErrorState message={m.common.chartFailed} onRetry={() => void summary.refetch()} />
        </div>
      ) : null}
      <Hero summary={summary.data} />
      <Facts summary={summary.data} />
      <Race />
      <HowItWorks summary={summary.data} />
      <TrackStory />
      <Glance summary={summary.data} />
    </main>
  );
}
