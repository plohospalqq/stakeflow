import { useMemo } from 'react';
import { Link } from 'react-router';
import { USE_MOCKS } from '@/api/mode';
import type { ReportedQuarter } from '@/api/types';
import { ChartCard, type ChartState } from '@/components/ChartCard';
import { EChart } from '@/components/charts/EChart';
import { buildReconciliationOption } from '@/components/charts/quarterOption';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { ErrorChip } from '@/components/Chips';
import { Icon } from '@/components/Icon';
import { formatDate, formatPct, formatQuarter } from '@/lib/format';
import { reconciledQuarters, reconciliationSummary } from '@/lib/trackRecord';
import { ReconciliationTable } from '../track/ReconciliationTable';

const SHOWN = 8;

/** Plain-language reasons, so a 1% gap reads as expected rather than as an error. */
export function WhyTheyDiffer() {
  return (
    <div className="mx-2 mb-1 flex flex-col gap-1.5 rounded-control bg-surface2 px-3 py-2.5 text-[12px] text-muted">
      <span className="font-semibold text-ink">Why the two numbers differ</span>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
        <li>
          Companies report equity or entitlement volumes; Sodir has field totals × licence share.
        </li>
        <li>Each company converts gas and NGL to barrels with its own factors.</li>
        <li>
          Sodir revises recent months, and the newest month of a quarter arrives 40–69 days late.
        </li>
      </ul>
    </div>
  );
}

/** Q2 2026 → 'Q2 26' for tight axis labels. */
function shortQuarter(quarterStart: string): string {
  return formatQuarter(quarterStart).replace(/ 20(\d\d)$/, ' $1');
}

/**
 * Real numbers only: what Sodir data attributes to the company each quarter, next to what
 * the company itself reported. No model involved, which is why it sits apart from the
 * (sample) nowcast chart.
 */
export function ReconciliationCard({
  companyId,
  companyName,
  quarters,
  state,
  onRetry,
}: {
  companyId: string;
  companyName: string;
  quarters: ReportedQuarter[] | undefined;
  state: ChartState;
  onRetry: () => void;
}) {
  const units = useUnits();
  const t = useChartTheme();
  const isDesktop = useIsDesktop();
  const digits = units.unit === 'boe' ? 1 : 3;
  const recent = useMemo(() => (quarters ?? []).slice(-SHOWN), [quarters]);
  const reconciled = useMemo(
    () => reconciledQuarters(companyId, quarters ?? []),
    [companyId, quarters],
  );
  const summary = reconciliationSummary(reconciled);

  const option = useMemo(
    () =>
      buildReconciliationOption(
        t,
        recent.map((q) => ({
          label: shortQuarter(q.quarterStart),
          quarterName: formatQuarter(q.quarterStart),
          attributed: units.fromQuarterRate(q.attributedKboed, q.quarterStart),
          reported:
            q.reportedKboed === null
              ? null
              : units.fromQuarterRate(q.reportedKboed, q.quarterStart),
          gapPct: q.errorPct,
          monthsInData: q.monthsInData,
        })),
        {
          compact: !isDesktop,
          format: (v) => units.format(v, digits),
          unitLabel: units.label,
        },
      ),
    [t, recent, units, isDesktop, digits],
  );

  const height = isDesktop ? 250 : 210;
  const hasReported = reconciled.length > 0;

  return (
    <ChartCard
      className="min-w-0 flex-[3_1_560px]"
      title="Public data vs reported, by quarter"
      subtitle={`Average daily production · ${units.label} · real figures, no model`}
      info="Bars are what Sodir's field data adds up to for the company (field output × ownership share). Circles are the production the company itself published in its trading update. The percentage is the gap between the two. They differ because companies report equity or entitlement volumes with their own boe factors, and Sodir revises recent months."
      actions={
        <Link
          to={`/track-record?co=${companyId}`}
          className="text-[13px] text-muted underline underline-offset-2 hover:text-ink"
        >
          Full track record
        </Link>
      }
      legend={[
        { label: 'Sodir-attributed', color: 'var(--f4)' },
        ...(hasReported
          ? [{ label: 'Reported by the company', color: 'var(--fc)', kind: 'dot' as const }]
          : []),
        { label: 'Quarter still missing Sodir months', color: 'var(--f4)', kind: 'band' },
      ]}
      source={{
        label: USE_MOCKS ? 'Sample data' : 'Sodir; company trading updates',
      }}
      state={state === 'ready' && recent.length === 0 ? 'empty' : state}
      onRetry={onRetry}
      height={height}
      table={
        <ReconciliationTable
          rows={recent.map((quarter) => ({ companyId, quarter })).reverse()}
          caption={`${companyName}: Sodir-attributed vs reported production by quarter`}
        />
      }
    >
      <div className="flex flex-col gap-2 px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={`${companyName} quarterly production attributed from Sodir data${
            hasReported && summary.meanAbsGap !== null
              ? `, on average ${formatPct(summary.meanAbsGap, 2)} away from the reported figure over ${summary.complete} complete quarters`
              : ''
          }`}
        />
        {hasReported ? (
          <ul
            className="m-0 flex list-none flex-col p-0 px-2 text-[13px]"
            aria-label="Quarters with a company-reported figure"
          >
            {[...reconciled].reverse().map(({ quarter: q }) => (
              <li
                key={q.quarterStart}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2"
              >
                <span className="num w-[64px] font-medium">{formatQuarter(q.quarterStart)}</span>
                <span className="text-muted">
                  Sodir{' '}
                  <span className="num text-ink">
                    {units.format(units.fromQuarterRate(q.attributedKboed, q.quarterStart), digits)}
                  </span>{' '}
                  vs reported{' '}
                  <span className="num text-ink">
                    {units.format(units.fromQuarterRate(q.reportedKboed, q.quarterStart), digits)}
                  </span>
                </span>
                <ErrorChip value={q.errorPct} digits={2} />
                {q.isComplete ? null : (
                  <span className="chip">{q.monthsInData} of 3 months · provisional</span>
                )}
                {q.sourceUrl ? (
                  <a
                    href={q.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink"
                  >
                    Trading update{q.reportedOn ? `, ${formatDate(q.reportedOn)}` : ''}
                    <Icon name="external" size={12} />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="lbl m-0 px-2 pb-1">
          {hasReported
            ? summary.meanAbsGap !== null
              ? `Average gap ${formatPct(summary.meanAbsGap, 2)} over ${summary.complete} complete quarter${summary.complete === 1 ? '' : 's'}${
                  summary.partial
                    ? `; ${summary.partial} provisional quarter left out until Sodir has all three months`
                    : ''
                }.`
              : 'Only provisional quarters so far: the gap settles once Sodir has all three months.'
            : `${companyName} has no company-reported quarter in the data to compare with yet.`}
        </p>
        <WhyTheyDiffer />
      </div>
    </ChartCard>
  );
}
