import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import {
  useCompany,
  useCompanyFields,
  useCompanyProduction,
  useCompanyQuarters,
  useFreshness,
  useLatestPrices,
  useNowcasts,
  usePredictionLog,
} from '@/api/hooks';
import { isNotFound } from '@/api/http';
import { isSample } from '@/api/mode';
import type { CompanyDetail as Company, CompanyFieldMonthly, ReportedQuarter } from '@/api/types';
import type { ChartState } from '@/components/ChartCard';
import { ErrorChip } from '@/components/Chips';
import { ErrorState } from '@/components/ErrorState';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { Rings } from '@/components/Rings';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useCompanyName, useCompanyScope } from '@/hooks/useCompanyName';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { COMPANY_META } from '@/lib/companies';
import { addMonths, monthRange } from '@/lib/dates';
import {
  formatMonth,
  formatMonthName,
  formatMonthNameLong,
  formatPct,
  formatQuarter,
  formatShare,
  formatUsd,
} from '@/lib/format';
import { latestView, type LatestView } from '@/lib/latest';
import { CompanyFacts } from './company/CompanyFacts';
import { CompanySwitcher } from './company/CompanySwitcher';
import { FieldStackCard } from './company/FieldStackCard';
import { NowcastCard } from './company/NowcastCard';
import { ReconciliationCard } from './company/ReconciliationCard';
import { RevenueCard } from './company/RevenueCard';
import { useRevenue, type RevenueModel } from './company/useRevenue';

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

/** "What it means": the company in a few computed sentences, for Simple words mode. */
function PlainWords({
  company,
  view,
  fields,
  revenue,
}: {
  company: Company;
  view: LatestView;
  fields: CompanyFieldMonthly[] | undefined;
  revenue: RevenueModel | null;
}) {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const latest = (fields ?? []).filter((f) => f.month === view.month);
  const total = latest.reduce((s, f) => s + f.oeSm3, 0);
  const top = [...latest].sort((a, b) => b.oeSm3 - a.oeSm3)[0];
  const perDayUsd = revenue ? revenue.estimate.totalUsd / revenue.days : null;
  const lines = [
    t(m.plain.companyFields, {
      company: name(company.id, company.name),
      value: units.format(view.value),
      unit: units.label,
      fields: plural(m.common.fields, company.producingFieldCount),
    }),
    top && total > 0
      ? t(m.plain.companyTop, { field: top.fieldName, share: formatShare(top.oeSm3 / total) })
      : null,
    view.momPct !== null
      ? t(m.plain.companyChange, {
          pct: formatPct(Math.abs(view.momPct), 1),
          direction: view.momPct >= 0 ? m.plain.more : m.plain.less,
          month: formatMonthNameLong(addMonths(view.month, -1)),
        })
      : null,
    perDayUsd && revenue
      ? t(
          revenue.isSample
            ? m.plain.companyMoneySample
            : revenue.isAtLatest
              ? m.plain.companyMoney
              : m.plain.companyMoneyYours,
          { usd: formatUsd(perDayUsd) },
        )
      : null,
  ].filter((l): l is string => Boolean(l));
  return (
    <section
      aria-labelledby="plain-h"
      className="card enter flex flex-col gap-3 p-6 nav:col-span-2"
    >
      <h2 id="plain-h" className="m-0 text-[13px] font-semibold text-muted">
        {m.common.whatItMeans}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[17px] leading-[1.45]">
        {lines.map((line, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-2.5">
            <span
              className="display num flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{ background: ['var(--oil)', 'var(--gas)', 'var(--cnd)', 'var(--fa)'][i] }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>
              <Rich text={line} />
            </span>
          </li>
        ))}
      </ul>
      {perDayUsd && revenue?.isSample ? (
        <SampleBadge className="self-start" detail={m.sample.revenue} />
      ) : null}
    </section>
  );
}

function MixTile({ company }: { company: Company }) {
  const { m, t } = useI18n();
  const mix = company.latest?.mix;
  if (!mix || !company.latest) return null;
  const parts = [
    { key: 'oil', label: m.products.oil, value: mix.oil, color: 'var(--oil)' },
    { key: 'gas', label: m.products.gas, value: mix.gas, color: 'var(--gas)' },
    { key: 'ngl', label: m.products.nglCond, value: mix.nglCond, color: 'var(--cnd)' },
  ];
  return (
    <section
      aria-labelledby="mix-h"
      className="card enter flex flex-col items-center gap-5 p-6 sm:flex-row nav:col-span-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id="mix-h" className="m-0 text-[13px] font-semibold text-muted">
          {m.company.mixTitle} · {formatMonth(company.latest.month)}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className="dot" style={{ background: p.color }} aria-hidden="true" />
              {p.key === 'ngl' ? <Term id="nglCond">{p.label}</Term> : p.label}
              <span className="display num ml-auto text-[22px] font-semibold tracking-[-0.02em]">
                {formatShare(p.value, 1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Rings
        size={170}
        stroke={16}
        label={t(m.company.ringsLabel, {
          oil: formatShare(mix.oil, 1),
          gas: formatShare(mix.gas, 1),
          ngl: formatShare(mix.nglCond, 1),
        })}
        rings={parts.map((p) => ({ key: p.key, value: p.value, color: p.color }))}
      />
    </section>
  );
}

export default function CompanyDetail() {
  const { id = '' } = useParams();
  const { m, t, simple } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const scope = useCompanyScope();
  const isDesktop = useIsDesktop();
  const company = useCompany(id);
  const freshness = useFreshness();
  const production = useCompanyProduction(id);
  const fields = useCompanyFields(id);
  const quarters = useCompanyQuarters(id);
  const nowcasts = useNowcasts();
  const log = usePredictionLog();
  const prices = useLatestPrices();

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
  const revenue = useRevenue(production.data, nowcast, prices.data);

  if (company.isError) {
    const missing = isNotFound(company.error);
    return (
      <Page
        label={
          <Link to="/companies" className="link">
            {m.page.companies}
          </Link>
        }
        title={missing ? m.company.notFound : m.company.unavailable}
      >
        <ErrorState
          message={missing ? t(m.company.notFoundText, { id }) : m.company.unavailableText}
          onRetry={missing ? undefined : () => void company.refetch()}
        />
        <CompanySwitcher current={id} />
      </Page>
    );
  }

  const c = company.data;
  const title = c ? name(c.id, c.name) : meta ? name(id) : m.company.loadingName;
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
  const digits = units.digits;
  const compact = !isDesktop;

  return (
    <Page
      documentTitle={c ? name(c.id, c.name) : undefined}
      label={
        <span className="flex flex-wrap items-center gap-2">
          {m.page.companies}
          {meta ? (
            <span className="rounded-lg bg-surface2 px-2 py-0.5 text-[12px] font-semibold">
              {meta.ticker}
            </span>
          ) : null}
        </span>
      }
      title={title}
      meta={
        <span className="text-[15px] text-muted">
          {meta || id === 'equinor' ? scope(id) : (c?.scopeNote ?? '')}
        </span>
      }
      actions={<CompanySwitcher current={id} />}
    >
      <section
        aria-label={m.page.keyNumbers}
        className="grid grid-cols-2 gap-3 nav:grid-cols-4 nav:gap-5"
      >
        <KpiCard
          index={0}
          label={
            latest
              ? t(simple ? m.company.productionPlain : m.company.production, {
                  month: formatMonth(latest.month),
                })
              : m.company.productionEmpty
          }
          value={company.isPending ? null : (view?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={compact}
          delta={view?.momPct != null ? { value: view.momPct } : undefined}
          sub={
            latest
              ? t(m.common.vsMonth, { month: formatMonthName(addMonths(latest.month, -1)) })
              : m.company.noRecent
          }
          spark={spark}
        />
        <KpiCard
          index={1}
          label={
            ref
              ? t(ref.reported ? m.company.reportedQuarter : m.company.attributedQuarter, {
                  quarter: formatQuarter(ref.quarter.quarterStart),
                })
              : m.company.lastQuarter
          }
          value={quarters.isPending ? null : (refValue ?? 0)}
          unit={units.label}
          format={(v) => units.format(v, digits)}
          compact={compact}
          sub={
            ref?.reported && ref.quarter.errorPct !== null ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <ErrorChip value={ref.quarter.errorPct} digits={2} />
                <Term id="gap">{m.company.sodirGap}</Term>
                {ref.quarter.isComplete
                  ? ''
                  : ` (${t(m.company.monthsOf3, { n: ref.quarter.monthsInData })})`}
              </span>
            ) : (
              m.company.noCompanyFigure
            )
          }
        />
        {nowcast && nowValue !== null ? (
          <KpiCard
            index={2}
            label={
              <Term id="nowcast">
                {t(simple ? m.company.nowcastPlain : m.company.nowcastLabel, {
                  quarter: formatQuarter(nowcast.quarterStart),
                })}
              </Term>
            }
            value={nowValue}
            unit={units.label}
            format={(v) => units.format(v, digits)}
            compact={compact}
            sample={isSample('nowcast')}
            delta={refValue ? { value: (nowValue / refValue - 1) * 100 } : undefined}
            sub={t(m.company.range, {
              lo: units.format(units.fromQuarterRate(nowcast.lo, nowcast.quarterStart)),
              hi: units.format(units.fromQuarterRate(nowcast.hi, nowcast.quarterStart)),
            })}
          />
        ) : nowcasts.isPending ? (
          <KpiCard label={m.company.nowcast} value={null} unit="" format={String} />
        ) : (
          <div className="card flex min-w-0 flex-col gap-1.5 p-5">
            <span className="text-[13px] font-semibold text-muted">{m.company.quarterNowcast}</span>
            <span className="text-[14px] text-muted">
              {nowcasts.isError ? m.company.nowcastUnavailable : m.company.notModelled}
            </span>
          </div>
        )}
        {revenue ? (
          <KpiCard
            index={3}
            label={t(m.company.revenueLabel, { quarter: formatQuarter(revenue.quarterStart) })}
            value={revenue.estimate.totalUsd}
            unit=""
            format={formatUsd}
            compact={compact}
            sample={revenue.isSample}
            sub={revenue.isAtLatest ? m.company.atLatest : m.company.atYours}
          />
        ) : production.isPending || prices.isPending ? (
          <KpiCard label={m.company.revenue} value={null} unit="" format={String} />
        ) : (
          <div className="card flex min-w-0 flex-col gap-1.5 p-5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-muted">{m.company.revenue}</span>
              {isSample('prices') ? <SampleBadge /> : null}
            </span>
            <span className="text-[14px] text-muted">
              {prices.isError ? m.company.noPrices : m.company.noRevenue}
            </span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 nav:grid-cols-4">
        {c && view && simple ? (
          <PlainWords company={c} view={view} fields={fields.data} revenue={revenue} />
        ) : null}
        {c ? <MixTile company={c} /> : <Skeleton height={200} className="nav:col-span-2" />}
        {!simple || !view ? (
          <div className="nav:col-span-2">
            <CompanyFacts company={c} />
          </div>
        ) : null}
      </div>

      <FieldStackCard
        companyName={title}
        rows={fields.data}
        months={months}
        state={freshness.isPending ? 'loading' : queryState(fields)}
        onRetry={() => void fields.refetch()}
      />

      <div className="grid grid-cols-1 items-start gap-5 nav:grid-cols-5">
        <div className="min-w-0 nav:col-span-3">
          <ReconciliationCard
            companyId={id}
            companyName={title}
            quarters={quarters.data}
            state={queryState(quarters)}
            onRetry={() => void quarters.refetch()}
          />
        </div>
        <div className="min-w-0 nav:col-span-2">
          <RevenueCard model={revenue} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 nav:grid-cols-5">
        <div className="min-w-0 nav:col-span-3">
          <NowcastCard
            companyName={title}
            predictions={predictions}
            state={queryState(log)}
            onRetry={() => void log.refetch()}
          />
        </div>
        {simple && view ? (
          <div className="min-w-0 nav:col-span-2">
            <CompanyFacts company={c} />
          </div>
        ) : null}
      </div>
    </Page>
  );
}
