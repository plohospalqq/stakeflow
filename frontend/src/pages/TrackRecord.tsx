import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useCompaniesQuarters, usePredictionLog } from '@/api/hooks';
import { isSample } from '@/api/mode';
import type { PredictionKind } from '@/api/types';
import type { ChartState } from '@/components/ChartCard';
import { ErrorState } from '@/components/ErrorState';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { SectionHeading } from '@/components/SectionHeading';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Term } from '@/components/Term';
import { useCompanyName, useReportKind } from '@/hooks/useCompanyName';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';
import { quarterOf } from '@/lib/dates';
import { formatDate, formatNumber, formatPct, formatQuarter } from '@/lib/format';
import {
  frozenAt,
  leadDays,
  modelStats,
  reconciledQuarters,
  reconciliationSummary,
  type ModelStats,
} from '@/lib/trackRecord';
import { WhyTheyDiffer } from './company/ReconciliationCard';
import { AccuracyCard } from './track/AccuracyCard';
import { KindChip, PredictionLog } from './track/PredictionLog';
import { ReconciliationTable } from './track/ReconciliationTable';
import { TrustItems } from './track/TrustItems';

const ALL = 'all';

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

/** The four scores for one kind of prediction; live and backtests never share a row. */
function StatsRow({
  kind,
  stats,
  pending,
}: {
  kind: PredictionKind;
  stats: ModelStats | null;
  pending: boolean;
}) {
  const { m, t } = useI18n();
  const isDesktop = useIsDesktop();
  const sample = isSample('predictions');
  const value = (v: number | null | undefined) => (pending ? null : (v ?? 0));
  return (
    <div
      aria-label={t(m.track.summary, { kind: m.track.kind[kind] })}
      role="group"
      className="grid grid-cols-2 gap-3 nav:grid-cols-4 nav:gap-5"
    >
      <KpiCard
        index={0}
        label={m.track.avgErrModel}
        value={value(stats?.modelError)}
        unit="%"
        format={(v) => formatNumber(v, 1)}
        compact={!isDesktop}
        sample={sample}
        sub={m.track.howFar}
      />
      <KpiCard
        index={1}
        label={m.track.avgErrBaseline}
        value={value(stats?.baselineError)}
        unit="%"
        format={(v) => formatNumber(v, 1)}
        compact={!isDesktop}
        sample={sample}
        sub={
          stats?.improvement != null ? (
            <Rich
              text={stats.improvement >= 1 ? m.track.moreAccurate : m.track.lessAccurate}
              vars={{
                n: formatNumber(
                  stats.improvement >= 1 ? stats.improvement : 1 / stats.improvement,
                  1,
                ),
              }}
            />
          ) : (
            m.track.noResolved
          )
        }
      />
      <KpiCard
        index={2}
        label={<Term id="range80">{m.track.inRange}</Term>}
        value={value(stats?.inRange)}
        unit=""
        format={(v) => `${formatNumber(v, 0)} / ${stats?.resolved ?? 0}`}
        compact={!isDesktop}
        sample={sample}
        sub={m.track.inRangeSub}
      />
      <KpiCard
        index={3}
        label={m.track.bias}
        value={value(stats?.bias)}
        unit="%"
        format={(v) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)}`}
        compact={!isDesktop}
        sample={sample}
        sub={
          stats
            ? `${m.track.biasSub} · ${formatQuarter(stats.firstQuarter)}–${formatQuarter(stats.lastQuarter)}`
            : m.track.biasSub
        }
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="display num text-[34px] font-bold leading-none tracking-[-0.04em]">
        {value}
      </span>
      <span className="lbl">{sub}</span>
    </div>
  );
}

export default function TrackRecord() {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const reportKind = useReportKind();
  const [company, setCompany] = useCompanyFilter();
  const ids = useMemo(() => (company === ALL ? FOCUS_ORDER : [company]), [company]);
  const quarterQueries = useCompaniesQuarters(FOCUS_ORDER);
  const log = usePredictionLog();

  // A few dozen rows at most: cheap enough to rebuild on every render.
  const perCompany = FOCUS_ORDER.map((id, i) => ({
    id,
    rows: reconciledQuarters(id, quarterQueries[i]?.data ?? []),
  }));
  const reconRows = perCompany
    .filter((c) => ids.includes(c.id))
    .flatMap((c) => c.rows)
    .sort(
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
  const live = predictions.filter((p) => p.kind === 'live');
  const backtests = predictions.filter((p) => p.kind === 'backtest');
  const liveStats = modelStats(live);
  const backtestStats = modelStats(backtests);
  const resolved = predictions.filter((p) => p.reportedOn !== null && p.status === 'resolved');
  const averageLead = resolved.length
    ? Math.round(
        resolved.reduce((s, p) => s + leadDays(frozenAt(p), p.reportedOn ?? p.madeAt), 0) /
          resolved.length,
      )
    : null;
  const nextLive = live
    .filter((p) => p.status === 'open')
    .sort((a, b) => a.expectedReportOn.localeCompare(b.expectedReportOn))[0];
  const sample = isSample('predictions');
  const logState: ChartState = log.isError ? 'error' : log.isPending ? 'loading' : 'ready';
  const filterOptions = [
    { value: ALL, label: m.track.allCompanies },
    ...FOCUS_ORDER.map((id) => ({ value: id, label: name(id) })),
  ];

  return (
    <Page label={m.track.label} title={m.track.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label={m.track.companyFilter}
          value={company}
          onChange={setCompany}
          options={filterOptions}
        />
        <span className="lbl">{t(m.track.unitNote, { unit: units.label })}</span>
      </div>

      <section className="card enter flex min-w-0 flex-col" aria-labelledby="rc-h">
        <SectionHeading
          id="rc-h"
          title={m.track.reconTitle}
          sub={t(m.track.reconSub, { unit: units.label })}
        />
        {reconError ? (
          <ErrorState
            className="mx-5 my-2"
            message={m.track.reconFailed}
            onRetry={() => quarterQueries.forEach((q) => void q.refetch())}
          />
        ) : (
          <>
            <ul
              aria-label={m.track.perCompany}
              className="m-0 grid list-none gap-3 px-5 pb-3 pt-2 nav:grid-cols-3"
            >
              {perCompany
                .filter((c) => ids.includes(c.id))
                .map((c) => {
                  const s = reconciliationSummary(c.rows);
                  return (
                    <li key={c.id} className="flex flex-col gap-1 rounded-2xl bg-surface2 p-4">
                      <span className="text-[13px] font-semibold text-muted">{name(c.id)}</span>
                      <span className="display num text-[34px] font-bold leading-none tracking-[-0.04em]">
                        {s.meanAbsGap === null ? '–' : formatPct(s.meanAbsGap, 2)}
                      </span>
                      <span className="lbl">
                        <Term id="gap">{m.track.avgGap}</Term> ·{' '}
                        {plural(m.track.overQuarters, s.complete)}
                      </span>
                    </li>
                  );
                })}
            </ul>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pb-3 pt-2 nav:grid-cols-[repeat(3,minmax(0,240px))]">
              <Stat
                label={m.track.avgGap}
                value={recon.meanAbsGap === null ? '–' : formatPct(recon.meanAbsGap, 2)}
                sub={plural(m.track.overQuarters, recon.complete)}
              />
              <Stat
                label={m.track.largestGap}
                value={recon.maxAbsGap === null ? '–' : formatPct(recon.maxAbsGap, 2)}
                sub={m.track.ignoringDirection}
              />
              <Stat
                label={m.track.provisional}
                value={String(recon.partial)}
                sub={m.track.provisionalSub}
              />
            </div>
            <div className="px-2 pb-2">
              <ReconciliationTable
                rows={reconRows}
                showCompany
                loading={reconPending}
                caption={m.track.reconCaption}
                empty={m.track.reconEmpty}
              />
            </div>
            {withoutReports.length > 0 ? (
              <p className="lbl m-0 px-5 pb-2">
                {t(m.track.noReports, {
                  companies: withoutReports.map((id) => name(id)).join(', '),
                })}
              </p>
            ) : null}
            <div className="flex flex-col pb-5 pt-1">
              <WhyTheyDiffer withVar={ids.includes('var-energi')} />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="model-h" className="mt-4 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="model-h" className="display m-0 text-display-l font-bold">
              {m.track.modelTitle}
            </h2>
            {sample ? <SampleBadge detail={m.sample.nowcastAll} /> : null}
          </div>
          <p className="m-0 max-w-[780px] text-[15px] text-muted">{m.track.modelText}</p>
        </div>

        <TrustItems averageLead={averageLead} />

        {log.isError ? (
          <ErrorState message={m.track.logFailed} onRetry={() => void log.refetch()} />
        ) : (
          <>
            <section aria-labelledby="live-h" className="card enter flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <KindChip kind="live" />
                <h3 id="live-h" className="m-0 text-[15px] font-semibold">
                  {m.track.liveTitle}
                </h3>
              </div>
              <p className="m-0 text-[14px] text-muted">
                {liveStats
                  ? plural(m.track.liveScored, liveStats.resolved)
                  : nextLive
                    ? t(m.track.liveNone, {
                        quarter: formatQuarter(nextLive.quarterStart),
                        freeze: formatDate(quarterOf(nextLive.quarterStart).end),
                        company: name(nextLive.companyId, nextLive.companyName),
                        kind: reportKind(nextLive.reportKind),
                        date: formatDate(nextLive.expectedReportOn),
                      })
                    : m.track.liveEmpty}
              </p>
            </section>
            {liveStats ? <StatsRow kind="live" stats={liveStats} pending={log.isPending} /> : null}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <KindChip kind="backtest" />
                <h3 className="m-0 text-[15px] font-semibold">{m.track.backtestTitle}</h3>
              </div>
              <p className="m-0 max-w-[780px] text-[14px] text-muted">
                <Rich text={m.track.backtestText} />
              </p>
            </div>
            <StatsRow kind="backtest" stats={backtestStats} pending={log.isPending} />
          </>
        )}

        {liveStats ? (
          <AccuracyCard
            kind="live"
            predictions={predictions}
            state={logState}
            onRetry={() => void log.refetch()}
          />
        ) : null}
        <AccuracyCard
          kind="backtest"
          predictions={predictions}
          state={logState}
          onRetry={() => void log.refetch()}
        />
        <PredictionLog predictions={predictions} loading={log.isPending} />
      </section>
    </Page>
  );
}
