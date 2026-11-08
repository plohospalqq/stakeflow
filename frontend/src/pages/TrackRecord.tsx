import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useCompaniesQuarters, usePredictionLog } from '@/api/hooks';
import type { ChartState } from '@/components/ChartCard';
import { ErrorState } from '@/components/ErrorState';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { COMPANY_META, FOCUS_ORDER } from '@/lib/companies';
import { formatNumber, formatPct, formatQuarter } from '@/lib/format';
import { leadDays, modelStats, reconciledQuarters, reconciliationSummary } from '@/lib/trackRecord';
import { WhyTheyDiffer } from './company/ReconciliationCard';
import { AccuracyCard } from './track/AccuracyCard';
import { PredictionLog } from './track/PredictionLog';
import { ReconciliationTable } from './track/ReconciliationTable';
import { TrustItems } from './track/TrustItems';

const ALL = 'all';

const FILTER_OPTIONS = [
  { value: ALL, label: 'All companies' },
  ...FOCUS_ORDER.map((id) => ({ value: id, label: COMPANY_META[id]?.name ?? id })),
];

/** ?co= keeps the filter in the URL, so the company page can link straight to its rows. */
function useCompanyFilter(): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('co');
  const value = raw && FOCUS_ORDER.includes(raw) ? raw : ALL;
  const set = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next === ALL) updated.delete('co');
    else updated.set('co', next);
    setParams(updated, { replace: true, preventScrollReset: true });
  };
  return [value, set];
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <span className="num text-[22px] font-semibold tracking-[-0.02em]">{value}</span>
      <span className="lbl">{sub}</span>
    </div>
  );
}

export default function TrackRecord() {
  const units = useUnits();
  const isDesktop = useIsDesktop();
  const [company, setCompany] = useCompanyFilter();
  const ids = useMemo(() => (company === ALL ? FOCUS_ORDER : [company]), [company]);
  const quarterQueries = useCompaniesQuarters(FOCUS_ORDER);
  const log = usePredictionLog();

  // A few dozen rows at most: cheap enough to rebuild on every render.
  const reconRows = FOCUS_ORDER.flatMap((id, i) =>
    ids.includes(id) ? reconciledQuarters(id, quarterQueries[i]?.data ?? []) : [],
  ).sort(
    (a, b) =>
      b.quarter.quarterStart.localeCompare(a.quarter.quarterStart) ||
      a.companyId.localeCompare(b.companyId),
  );
  const recon = reconciliationSummary(reconRows);
  const reconPending = quarterQueries.some((q) => q.isPending);
  const reconError = quarterQueries.some((q) => q.isError);
  const withoutReports = ids.filter(
    (id) =>
      !reconRows.some((r) => r.companyId === id) &&
      quarterQueries[FOCUS_ORDER.indexOf(id)]?.isSuccess,
  );

  const predictions = useMemo(
    () => (log.data ?? []).filter((p) => ids.includes(p.companyId)),
    [log.data, ids],
  );
  const stats = modelStats(predictions);
  const resolved = predictions.filter((p) => p.reportedOn !== null && p.status === 'resolved');
  const averageLead = resolved.length
    ? Math.round(
        resolved.reduce((s, p) => s + leadDays(p.madeAt, p.reportedOn ?? p.madeAt), 0) /
          resolved.length,
      )
    : null;
  const logState: ChartState = log.isError ? 'error' : log.isPending ? 'loading' : 'ready';

  return (
    <Page label="Track record" title="Every prediction, scored">
      <TrustItems averageLead={averageLead} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Company"
          value={company}
          onChange={setCompany}
          options={FILTER_OPTIONS}
        />
        <span className="lbl">
          Production as average {units.unit === 'boe' ? 'kboe/d' : 'month, MSm³ o.e.'} per quarter
        </span>
      </div>

      <section className="card flex min-w-0 flex-col" aria-labelledby="rc-h">
        <SectionHeading
          id="rc-h"
          title="Public data vs what the companies reported"
          sub={`Real figures, no model: Sodir field data × licence shares, next to each company's own trading update · ${units.label}`}
        />
        {reconError ? (
          <ErrorState
            className="mx-[18px] my-2"
            message="Reported quarters could not be loaded."
            onRetry={() => quarterQueries.forEach((q) => void q.refetch())}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-[18px] pb-2 pt-2 nav:grid-cols-[repeat(3,minmax(0,220px))]">
              <Stat
                label="Average gap"
                value={recon.meanAbsGap === null ? '–' : formatPct(recon.meanAbsGap, 2)}
                sub={`over ${recon.complete} complete quarter${recon.complete === 1 ? '' : 's'}`}
              />
              <Stat
                label="Largest gap"
                value={recon.maxAbsGap === null ? '–' : formatPct(recon.maxAbsGap, 2)}
                sub="ignoring direction"
              />
              <Stat
                label="Provisional"
                value={String(recon.partial)}
                sub="quarters still missing a Sodir month"
              />
            </div>
            <div className="px-1.5 pb-1.5">
              <ReconciliationTable
                rows={reconRows}
                showCompany
                loading={reconPending}
                caption="Sodir-attributed vs company-reported production by quarter"
                empty="No company-reported quarter for this selection yet."
              />
            </div>
            {withoutReports.length > 0 ? (
              <p className="lbl m-0 px-[18px] pb-2">
                {withoutReports.map((id) => COMPANY_META[id]?.name ?? id).join(', ')}: no
                company-reported quarter in the data yet
                {withoutReports.includes('equinor')
                  ? '. Equinor publishes no NCS-only production in a trading update, so there is nothing like-for-like to compare'
                  : ''}
                .
              </p>
            ) : null}
            <div className="flex flex-col pb-3.5 pt-1">
              <WhyTheyDiffer />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="model-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="model-h" className="m-0 text-h2">
              Nowcast model
            </h2>
            <SampleBadge detail="The nowcast model is not in the backend yet; every number below is sample data" />
          </div>
          <p className="m-0 max-w-[760px] text-[13px] text-muted">
            The quarterly nowcast is not in the backend yet. Everything below runs on sample
            predictions to show how each forecast will be scored: frozen at quarter end, compared
            with the trading update (Vår Energi about 12 days later, Aker BP about 14; Equinor with
            its quarterly report), and set against a simple guess.
          </p>
        </div>

        {log.isError ? (
          <ErrorState
            message="The prediction log could not be loaded."
            onRetry={() => void log.refetch()}
          />
        ) : (
          <div
            aria-label="Model summary"
            role="group"
            className="grid grid-cols-2 gap-3 nav:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] nav:gap-3.5"
          >
            <KpiCard
              label="Average error, our model"
              value={log.isPending ? null : (stats?.modelError ?? 0)}
              unit="%"
              format={(v) => formatNumber(v, 1)}
              compact={!isDesktop}
              sample
              sub="how far off, ignoring direction"
            />
            <KpiCard
              label="Average error, simple guess"
              value={log.isPending ? null : (stats?.baselineError ?? 0)}
              unit="%"
              format={(v) => formatNumber(v, 1)}
              compact={!isDesktop}
              sample
              sub={
                stats ? (
                  <>
                    model is{' '}
                    <strong className="text-ink">
                      {formatNumber(stats.improvement, 1)}× more accurate
                    </strong>
                  </>
                ) : (
                  'no resolved predictions'
                )
              }
            />
            <KpiCard
              label="Actual inside the 80% range"
              value={log.isPending ? null : (stats?.inRange ?? 0)}
              unit=""
              format={(v) => `${v} / ${stats?.resolved ?? 0}`}
              compact={!isDesktop}
              sample
              sub="expect about 8 in 10 if ranges are honest"
            />
            <KpiCard
              label="Bias"
              value={log.isPending ? null : (stats?.bias ?? 0)}
              unit="%"
              format={(v) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)}`}
              compact={!isDesktop}
              sample
              sub={
                stats
                  ? `positive = guesses run high · ${formatQuarter(stats.firstQuarter)}–${formatQuarter(stats.lastQuarter)}`
                  : 'positive = guesses run high'
              }
            />
          </div>
        )}

        <AccuracyCard
          predictions={predictions}
          state={logState}
          onRetry={() => void log.refetch()}
        />
        <PredictionLog predictions={predictions} loading={log.isPending} />
      </section>
    </Page>
  );
}
