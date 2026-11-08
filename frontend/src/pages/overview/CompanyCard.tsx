import { Link } from 'react-router';
import {
  useCompanyFields,
  useCompanyProduction,
  useCompanyQuarters,
  useNowcasts,
} from '@/api/hooks';
import type { Company } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { MixBar } from '@/components/MixBar';
import { RangeBar } from '@/components/RangeBar';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { useUnits } from '@/hooks/useUnits';
import { COMPANY_META } from '@/lib/companies';
import { addMonths, quarterOf } from '@/lib/dates';
import { explainChange, fieldMoves } from '@/lib/explain';
import {
  formatDate,
  formatMonth,
  formatMonthName,
  formatMonthShort,
  formatQuarter,
} from '@/lib/format';
import { latestView } from '@/lib/latest';

export function CompanyCard({ company }: { company: Company }) {
  const units = useUnits();
  const latest = company.latest;
  const meta = COMPANY_META[company.id];
  const production = useCompanyProduction(company.id);
  const previousMonth = latest ? addMonths(latest.month, -1) : undefined;
  const fields = useCompanyFields(company.id, previousMonth ? { start: previousMonth } : undefined);
  const quarters = useCompanyQuarters(company.id);
  const nowcasts = useNowcasts();

  if (!latest) {
    return (
      <article className="card p-[18px]">
        <h3 className="m-0 text-[16px] font-semibold">{company.name}</h3>
        <p className="lbl m-0 mt-2">No production in the latest month.</p>
      </article>
    );
  }

  const view = latestView(latest, units.unit);
  const spark = (production.data ?? []).slice(-24).map((p) => units.fromMonth(p.oeSm3, p.month));
  const sentence =
    fields.data && previousMonth
      ? explainChange(
          fieldMoves(fields.data, latest.month, previousMonth, units.fromMonth),
          previousMonth,
          units.label,
          units.unit === 'boe' ? 1 : 3,
        )
      : null;

  const nowcast = nowcasts.data?.find((n) => n.companyId === company.id);
  const reported = [...(quarters.data ?? [])].reverse().find((q) => q.reportedKboed !== null);
  const lastQuarter = quarters.data?.[quarters.data.length - 1];
  const reference = reported ?? lastQuarter;
  const referenceValue =
    reference &&
    units.fromQuarterRate(
      reference.reportedKboed ?? reference.attributedKboed,
      reference.quarterStart,
    );
  const referenceLabel = reference
    ? reported
      ? `${formatQuarter(reference.quarterStart)} reported`
      : `${formatQuarter(reference.quarterStart)} Sodir-attributed (${reference.monthsInData} of 3 months)`
    : '';
  const nowValue = nowcast && units.fromQuarterRate(nowcast.value, nowcast.quarterStart);
  const nowLo = nowcast && units.fromQuarterRate(nowcast.lo, nowcast.quarterStart);
  const nowHi = nowcast && units.fromQuarterRate(nowcast.hi, nowcast.quarterStart);
  const sparkFrom = production.data?.slice(-24)[0]?.month;

  return (
    <article
      className="card flex min-w-0 flex-col gap-3.5 px-[18px] pb-4 pt-[18px]"
      aria-labelledby={`co-${company.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`co-${company.id}`} className="m-0 text-[16px] font-semibold">
            <Link to={`/companies/${company.id}`} className="link">
              {company.name}
            </Link>
          </h3>
          <span className="lbl">{meta?.scope ?? company.scopeNote}</span>
        </div>
        {meta ? <span className="chip num">{meta.ticker}</span> : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="lbl">Production, {formatMonth(latest.month)}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="num text-[26px] font-semibold leading-none tracking-[-0.02em] nav:text-kpi">
              {units.format(view.value)}
            </span>
            <span className="lbl">{units.label}</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-[5px]">
          {view.momPct !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="lbl">vs {formatMonthName(addMonths(latest.month, -1))}</span>
              <DeltaBadge value={view.momPct} />
            </span>
          ) : null}
          {view.yoyPct !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="lbl">vs {formatMonthShort(addMonths(latest.month, -12))}</span>
              <DeltaBadge value={view.yoyPct} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {spark.length > 1 ? (
          <Sparkline
            values={spark}
            area
            height={44}
            label={`${company.name} production over the last ${spark.length} months, ${
              (spark[spark.length - 1] ?? 0) >= (spark[0] ?? 0) ? 'up' : 'down'
            } from ${units.format(spark[0] ?? 0)} to ${units.format(spark[spark.length - 1] ?? 0)} ${units.label}`}
          />
        ) : (
          <Skeleton height={44} />
        )}
        <div className="lbl flex justify-between text-[11px]">
          <span>{sparkFrom ? formatMonth(sparkFrom) : ''}</span>
          <span>{spark.length} months</span>
          <span>{formatMonth(latest.month)}</span>
        </div>
      </div>

      <MixBar mix={latest.mix} showLegend />

      <p className="m-0 min-h-[20px] text-[13px] text-muted">
        {sentence ?? (fields.isPending ? <Skeleton width="80%" height={12} /> : null)}
      </p>

      <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="cap">
              {nowcast ? formatQuarter(nowcast.quarterStart) : 'Quarter'} nowcast
            </span>
            <SampleBadge detail="The nowcast model is not in the backend yet" />
          </span>
          {nowcast ? (
            <span className="chip">{nowcast.monthsInData} of 3 months in data</span>
          ) : null}
        </div>
        {nowcast && nowValue !== undefined && nowLo !== undefined && nowHi !== undefined ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="num text-[18px] font-semibold">{units.format(nowValue)}</div>
                <div className="lbl">
                  Nowcast · 80% range {units.format(nowLo)}–{units.format(nowHi)}
                </div>
              </div>
              <div>
                <div className="num text-[18px] font-semibold text-muted">
                  {referenceValue !== undefined ? units.format(referenceValue) : '–'}
                </div>
                <div className="lbl">{referenceLabel}</div>
              </div>
            </div>
            <RangeBar value={nowValue} lo={nowLo} hi={nowHi} reference={referenceValue} />
            <div className="lbl flex flex-wrap justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {referenceValue ? (
                  <DeltaBadge value={(nowValue / referenceValue - 1) * 100} />
                ) : null}
                vs last quarter
              </span>
              <span>
                {nowcast.reportKind === 'trading update' ? 'Trading update' : 'Quarterly report'} ≈{' '}
                {formatDate(nowcast.expectedReportOn)}
              </span>
            </div>
            <p className="lbl m-0">
              Frozen at quarter end ({formatDate(quarterOf(nowcast.quarterStart).end)}), scored
              against the {nowcast.reportKind}.
            </p>
          </>
        ) : (
          <Skeleton height={60} />
        )}
      </div>
    </article>
  );
}
