import { Link } from 'react-router';
import { useStartups } from '@/api/hooks';
import { isSample } from '@/api/mode';
import type { FieldStartup } from '@/api/types';
import { SampleBadge } from '@/components/SampleBadge';
import { Skeleton } from '@/components/Skeleton';
import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { monthStart } from '@/lib/dates';
import { formatMonth, formatPct } from '@/lib/format';

/** One company's share of a field, or null when it holds none. */
function shareOf(startup: FieldStartup, companyId: string): number | null {
  return startup.owners.find((o) => o.companyId === companyId)?.sharePct ?? null;
}

/**
 * The quarterly estimate's blind spots for one company: fields it part-owns that are approved
 * but not producing (not in the estimate at all) or in their first year (held at their best
 * recent month). These are where a nowcast misses most, so they are named next to it.
 */
export function StartupWatch({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const { m, t, plural } = useI18n();
  const units = useUnits();
  const startups = useStartups();
  const held = (startups.data ?? []).flatMap((s) => {
    const share = shareOf(s, companyId);
    return share === null ? [] : [{ ...s, share }];
  });
  const approved = held.filter((s) => s.stage === 'approved');
  const ramping = held.filter((s) => s.stage === 'ramping');

  const group = (title: string, note: string, rows: typeof held) =>
    rows.length === 0 ? null : (
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <h3 className="m-0 text-[14px] font-semibold">{title}</h3>
        <p className="lbl m-0">{note}</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
          {rows.map((s) => (
            <li key={s.fieldId} className="flex flex-wrap items-baseline justify-between gap-x-3">
              {s.stage === 'ramping' ? (
                <Link to={`/fields/${s.fieldId}`} className="link font-medium">
                  {s.fieldName}
                </Link>
              ) : s.factpageUrl ? (
                // Nothing produced yet, so nothing of ours to show: Sodir's page has the plan.
                <a
                  href={s.factpageUrl}
                  className="link font-medium"
                  rel="noreferrer"
                  target="_blank"
                >
                  {s.fieldName}
                  <span className="sr-only"> {m.common.opensNewTab}</span>
                </a>
              ) : (
                <span className="font-medium">{s.fieldName}</span>
              )}
              <span className="lbl num text-right">
                {t(m.startups.share, { share: formatPct(s.share, 1) })}
                {s.stage === 'approved' && s.approvedOn
                  ? ` · ${t(m.startups.approvedSince, { date: formatMonth(monthStart(s.approvedOn)) })}`
                  : null}
                {s.stage === 'ramping' && s.monthsProducing !== null
                  ? ` · ${plural(m.startups.months, s.monthsProducing)}`
                  : null}
                {s.stage === 'ramping' && s.latestBoePerDay !== null
                  ? ` · ${units.format(units.fromRate((s.latestBoePerDay * s.share) / 100 / 1000))} ${units.label}`
                  : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <aside className="card enter flex min-w-0 flex-col gap-3 p-5" aria-labelledby="sw-h">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 id="sw-h" className="display m-0 text-h2 font-semibold">
          {m.startups.title}
        </h2>
        {isSample('nowcast') ? <SampleBadge /> : null}
      </div>
      {startups.isPending ? (
        <Skeleton height={120} />
      ) : startups.isError ? (
        <p className="m-0 text-[14px] text-muted" role="alert">
          {m.startups.failed}
        </p>
      ) : held.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">{t(m.startups.none, { company: companyName })}</p>
      ) : (
        <>
          <p className="m-0 text-[14px] text-muted">
            {t(m.startups.lede, { company: companyName })}
          </p>
          {group(m.startups.approved, m.startups.approvedNote, approved)}
          {group(m.startups.ramping, m.startups.rampingNote, ramping)}
          <span className="lbl">{m.startups.source}</span>
        </>
      )}
    </aside>
  );
}
