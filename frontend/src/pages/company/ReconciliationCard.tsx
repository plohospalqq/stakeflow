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
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatPct, formatQuarter, formatQuarterShort } from '@/lib/format';
import { reconciledQuarters, reconciliationSummary } from '@/lib/trackRecord';
import { ReconciliationTable } from '../track/ReconciliationTable';

const SHOWN = 8;

/** Plain-language reasons, so a 1% gap reads as expected rather than as an error. */
export function WhyTheyDiffer({ withVar = false }: { withVar?: boolean }) {
  const { m } = useI18n();
  return (
    <div className="mx-3 mb-1 flex flex-col gap-1.5 rounded-2xl bg-surface2 px-4 py-3 text-[13px] text-muted">
      <span className="font-semibold text-ink">{m.recon.whyTitle}</span>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
        <li>{m.recon.why1}</li>
        <li>{m.recon.why2}</li>
        <li>{m.recon.why3}</li>
        {withVar ? <li>{m.recon.whyVar}</li> : null}
      </ul>
    </div>
  );
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
  const { m, t: tr, plural } = useI18n();
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
          label: formatQuarterShort(q.quarterStart),
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
          m,
        },
      ),
    [t, recent, units, isDesktop, digits, m],
  );

  const height = isDesktop ? 250 : 210;
  const hasReported = reconciled.length > 0;

  return (
    <ChartCard
      className="min-w-0 flex-[3_1_560px]"
      title={m.recon.title}
      subtitle={tr(m.recon.sub, { unit: units.label })}
      info={m.recon.info}
      actions={
        <Link
          to={`/track-record?co=${companyId}`}
          className="inline-flex min-h-[36px] items-center rounded-full bg-surface2 px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-surface3 max-nav:min-h-[44px]"
        >
          {m.recon.fullTrack}
        </Link>
      }
      legend={[
        { label: m.recon.legendAttributed, color: 'var(--f4)' },
        ...(hasReported
          ? [{ label: m.recon.legendReported, color: 'var(--fc)', kind: 'dot' as const }]
          : []),
        { label: m.recon.legendPartial, color: 'var(--f4)', kind: 'band' },
      ]}
      source={{
        label: USE_MOCKS ? m.common.sampleSource : m.recon.source,
      }}
      state={state === 'ready' && recent.length === 0 ? 'empty' : state}
      onRetry={onRetry}
      height={height}
      table={
        <ReconciliationTable
          rows={recent.map((quarter) => ({ companyId, quarter })).reverse()}
          caption={tr(m.recon.tableCaption, { company: companyName })}
        />
      }
    >
      <div className="flex flex-col gap-2 px-2 nav:px-3">
        <EChart
          option={option}
          height={height}
          ariaLabel={`${tr(m.recon.aria, { company: companyName })}${
            hasReported && summary.meanAbsGap !== null
              ? tr(m.recon.ariaGap, { gap: formatPct(summary.meanAbsGap, 2), n: summary.complete })
              : ''
          }`}
        />
        {hasReported ? (
          <ul
            className="m-0 flex list-none flex-col p-0 px-2 text-[13px]"
            aria-label={m.recon.listLabel}
          >
            {/* The newest six; the full list lives on the track-record page. */}
            {[...reconciled]
              .reverse()
              .slice(0, 6)
              .map(({ quarter: q }) => (
                <li
                  key={q.quarterStart}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2"
                >
                  <span className="num w-[64px] font-medium">{formatQuarter(q.quarterStart)}</span>
                  <span className="num text-muted">
                    {tr(m.recon.sodirVsReported, {
                      a: units.format(
                        units.fromQuarterRate(q.attributedKboed, q.quarterStart),
                        digits,
                      ),
                      b: units.format(
                        units.fromQuarterRate(q.reportedKboed, q.quarterStart),
                        digits,
                      ),
                    })}
                  </span>
                  <ErrorChip value={q.errorPct} digits={2} />
                  {q.isComplete ? null : (
                    <span className="chip">{tr(m.recon.provisional, { n: q.monthsInData })}</span>
                  )}
                  {q.sourceUrl ? (
                    <a
                      href={q.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex min-h-[32px] items-center gap-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink max-nav:min-h-[44px]"
                    >
                      {m.recon.report}
                      {q.reportedOn ? `, ${formatDate(q.reportedOn)}` : ''}
                      <Icon name="external" size={12} />
                      <span className="sr-only">{m.common.opensNewTab}</span>
                    </a>
                  ) : null}
                </li>
              ))}
          </ul>
        ) : null}
        <p className="lbl m-0 px-2 pb-1">
          {hasReported
            ? summary.meanAbsGap !== null
              ? `${tr(m.recon.summary, {
                  gap: formatPct(summary.meanAbsGap, 2),
                  quarters: plural(m.common.quarters, summary.complete),
                })}${summary.partial ? tr(m.recon.summaryPartial, { n: summary.partial }) : ''}.`
              : m.recon.onlyPartial
            : tr(m.recon.none, { company: companyName })}
        </p>
        <WhyTheyDiffer withVar={companyId === 'var-energi'} />
      </div>
    </ChartCard>
  );
}
