import { useCompanies, useFreshness } from '@/api/hooks';
import { ErrorState } from '@/components/ErrorState';
import { Page } from '@/components/layout/Page';
import { Skeleton } from '@/components/Skeleton';
import { useUnits } from '@/hooks/useUnits';
import { sortFocus } from '@/lib/companies';
import { formatMonthLong } from '@/lib/format';
import { CompanyCard } from './overview/CompanyCard';
import { HowItWorks } from './overview/HowItWorks';
import { LargestFields } from './overview/LargestFields';
import { PriceCards } from './overview/PriceCards';
import { RecentAnomalies } from './overview/RecentAnomalies';
import { TrackTeaser } from './overview/TrackTeaser';

export default function Overview() {
  const units = useUnits();
  const companies = useCompanies(true);
  const freshness = useFreshness();
  const month = freshness.data?.latestMonth;

  return (
    <Page label="Overview" title="Who produces what on the Norwegian shelf">
      <HowItWorks />

      <section aria-labelledby="co-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="co-h" className="m-0 text-h2">
            Companies{month ? ` · ${formatMonthLong(month)}` : ''}
          </h2>
          <span className="lbl">
            Net to each company&apos;s ownership share · {units.longLabel}
          </span>
        </div>
        {companies.isError ? (
          <ErrorState
            message="Company data could not be loaded."
            onRetry={() => void companies.refetch()}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
            {companies.data
              ? sortFocus(companies.data).map((c) => <CompanyCard key={c.id} company={c} />)
              : [0, 1, 2].map((i) => (
                  <div key={i} className="card flex flex-col gap-3 p-[18px]" aria-busy="true">
                    <Skeleton width="40%" height={16} />
                    <Skeleton width="60%" height={30} />
                    <Skeleton height={44} />
                    <Skeleton height={120} />
                  </div>
                ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[2_1_560px]">
          <LargestFields />
        </div>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          <PriceCards />
          <RecentAnomalies />
        </div>
      </div>

      <TrackTeaser />
    </Page>
  );
}
