import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import {
  useCompany,
  useCompanyFields,
  useCompanyProduction,
  useCompanyQuarters,
  useForwardPrices,
  useFreshness,
  useNowcasts,
  usePredictionLog,
} from '@/api/hooks';
import { isNotFound } from '@/api/http';
import type { ReportedQuarter } from '@/api/types';
import type { ChartState } from '@/components/ChartCard';
import { ErrorChip } from '@/components/Chips';
import { ErrorState } from '@/components/ErrorState';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { COMPANY_META } from '@/lib/companies';
import { addMonths, monthRange } from '@/lib/dates';
import { formatMonth, formatMonthName, formatQuarter, formatUsd } from '@/lib/format';
import { latestView } from '@/lib/latest';
import { CompanyFacts } from './company/CompanyFacts';
import { CompanySwitcher } from './company/CompanySwitcher';
import { FieldStackCard } from './company/FieldStackCard';
import { NowcastCard } from './company/NowcastCard';
import { ReconciliationCard } from './company/ReconciliationCard';
import { RevenueCard } from './company/RevenueCard';
import { useRevenue } from './company/useRevenue';

const MONTHS_SHOWN = 24;

function queryState(q: { isPending: boolean; isError: boolean }): ChartState {
  if (q.isError) return 'error';
  return q.isPending ? 'loading' : 'ready';
}

/** The newest quarter the company published a figure for, else the newest complete one. */
function referenceQuarter(quarters: ReportedQuarter[] | undefined) {
  const list = quarters ?? [];
  const reported = [...list].reverse().find((q) => q.reportedKboed !== null);
  if (reported) return { quarter: reported, reported: true };
  const complete = [...list].reverse().find((q) => q.isComplete);
  return complete ? { quarter: complete, reported: false } : null;
}

export default function CompanyDetail() {
  const { id = '' } = useParams();
  const units = useUnits();
  const isDesktop = useIsDesktop();
  const company = useCompany(id);
  const freshness = useFreshness();
  const production = useCompanyProduction(id);
  const fields = useCompanyFields(id);
  const quarters = useCompanyQuarters(id);
  const nowcasts = useNowcasts();
  const log = usePredictionLog();
  const forward = useForwardPrices();

  const meta = COMPANY_META[id];
  const latestMonth = freshness.data?.latestMonth;
  const months = useMemo(
    () => (latestMonth ? monthRange(addMonths(latestMonth, -(MONTHS_SHOWN - 1)), latestMonth) : []),
    [latestMonth],
  );
  const nowcast = nowcasts.data?.find((n) => n.companyId === id);
  const predictions = useMemo(
    () => (log.data ?? []).filter((p) => p.companyId === id),
    [log.data, id],
  );
  const revenue = useRevenue(production.data, nowcast, forward.data);

  if (company.isError) {
    const missing = isNotFound(company.error);
    return (
      <Page
        label={
          <Link to="/companies" className="link">
            Companies
          </Link>
        }
        title={missing ? 'Company not found' : 'Company unavailable'}
      >
        <ErrorState
          message={
            missing
              ? `There is no company with id “${id}”. Pick one of the focus companies above or from the overview.`
              : 'The company could not be loaded.'
          }
          onRetry={missing ? undefined : () => void company.refetch()}
        />
      </Page>
    );
  }

  const c = company.data;
  const name = c?.name ?? meta?.name ?? 'Loading company…';
  const latest = c?.latest ?? null;
  const view = latest ? latestView(latest, units.unit) : null;
  const spark = (production.data ?? [])
    .slice(-MONTHS_SHOWN)
    .map((p) => units.fromMonth(p.oeSm3, p.month));
  const ref = referenceQuarter(quarters.data);
  const refValue = ref
    ? units.fromQuarterRate(
        ref.quarter.reportedKboed ?? ref.quarter.attributedKboed,
        ref.quarter.quarterStart,
      )
    : null;
  const nowValue = nowcast ? units.fromQuarterRate(nowcast.value, nowcast.quarterStart) : null;
  const digits = units.unit === 'boe' ? 1 : 3;

  return (
    <Page
      documentTitle={c?.name ?? meta?.name}
      label={
        <span className="flex flex-wrap items-center gap-2">
          Companies
          {meta ? <span className="chip num">{meta.ticker}</span> : null}
        </span>
      }
      title={name}
      meta={<span className="lbl">{meta?.scope ?? c?.scopeNote ?? 'Norwegian shelf only'}</span>}
      actions={<CompanySwitcher current={id} />}
    >
      <section
        aria-label="Key numbers"
        className="grid grid-cols-2 gap-3 nav:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] nav:gap-3.5"
      >
        <KpiCard
          label={latest ? `Production, ${formatMonth(latest.month)}` : 'Production'}
          value={company.isPending ? null : (view?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={!isDesktop}
          delta={view?.momPct != null ? { value: view.momPct } : undefined}
          sub={latest ? `vs ${formatMonthName(addMonths(latest.month, -1))}` : 'no recent output'}
          spark={spark}
        />
        <KpiCard
          label={
            ref
              ? ref.reported
                ? `${formatQuarter(ref.quarter.quarterStart)} reported`
                : `${formatQuarter(ref.quarter.quarterStart)}, Sodir-attributed`
              : 'Last quarter'
          }
          value={quarters.isPending ? null : (refValue ?? 0)}
          unit={units.label}
          format={(v) => units.format(v, digits)}
          compact={!isDesktop}
          sub={
            ref?.reported && ref.quarter.errorPct !== null ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <ErrorChip value={ref.quarter.errorPct} digits={2} />
                Sodir gap
                {ref.quarter.isComplete ? '' : ` (${ref.quarter.monthsInData} of 3 months)`}
              </span>
            ) : (
              'no company figure to compare'
            )
          }
        />
        {nowcast && nowValue !== null ? (
          <KpiCard
            label={`${formatQuarter(nowcast.quarterStart)} nowcast`}
            value={nowValue}
            unit={units.label}
            format={(v) => units.format(v, digits)}
            compact={!isDesktop}
            sample
            delta={refValue ? { value: (nowValue / refValue - 1) * 100 } : undefined}
            sub={`range ${units.format(units.fromQuarterRate(nowcast.lo, nowcast.quarterStart))}–${units.format(
              units.fromQuarterRate(nowcast.hi, nowcast.quarterStart),
            )}`}
          />
        ) : nowcasts.isPending ? (
          <KpiCard label="Nowcast" value={null} unit="" format={String} />
        ) : (
          <div className="card flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
            <span className="lbl">Quarter nowcast</span>
            <span className="text-[13px] text-muted">
              Not modelled. Nowcasts cover Aker BP, Vår Energi and Equinor (NCS only).
            </span>
          </div>
        )}
        {revenue ? (
          <KpiCard
            label={`${formatQuarter(revenue.quarterStart)} revenue estimate`}
            value={revenue.estimate.totalUsd}
            unit="USD"
            format={formatUsd}
            compact={!isDesktop}
            sample
            sub={revenue.isAtForward ? 'at forward prices' : 'at your prices below'}
          />
        ) : production.isPending || forward.isPending ? (
          <KpiCard label="Revenue estimate" value={null} unit="" format={String} />
        ) : (
          <div className="card flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
            <span className="flex items-center justify-between gap-2">
              <span className="lbl">Revenue estimate</span>
              <SampleBadge />
            </span>
            <span className="text-[13px] text-muted">No recent production to price.</span>
          </div>
        )}
      </section>

      <FieldStackCard
        companyName={name}
        rows={fields.data}
        months={months}
        state={freshness.isPending ? 'loading' : queryState(fields)}
        onRetry={() => void fields.refetch()}
      />

      <div className="flex flex-wrap items-stretch gap-4">
        <ReconciliationCard
          companyId={id}
          companyName={name}
          quarters={quarters.data}
          state={queryState(quarters)}
          onRetry={() => void quarters.refetch()}
        />
        <RevenueCard model={revenue} />
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <NowcastCard
          companyName={name}
          predictions={predictions}
          state={queryState(log)}
          onRetry={() => void log.refetch()}
        />
        <CompanyFacts company={c} />
      </div>
    </Page>
  );
}
