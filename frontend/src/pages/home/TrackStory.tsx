import { Link } from 'react-router';
import { useCompaniesQuarters } from '@/api/hooks';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { RACE_ORDER } from '@/lib/companies';
import { formatPct } from '@/lib/format';
import { reconciledQuarters, reconciliationSummary } from '@/lib/trackRecord';

/**
 * The honest track record: Sodir field data × licence shares against what each company
 * reported, with no model in between. Real numbers from the reconciliation endpoint.
 */
export function TrackStory() {
  const { m, t, plural } = useI18n();
  const name = useCompanyName();
  const queries = useCompaniesQuarters(RACE_ORDER);
  const pending = queries.some((q) => q.isPending);
  const rows = RACE_ORDER.map((id, i) => ({
    id,
    summary: reconciliationSummary(reconciledQuarters(id, queries[i]?.data ?? [])),
  })).filter((r) => r.summary.complete > 0);
  const quarters = Math.max(0, ...rows.map((r) => r.summary.complete));
  const notes: Record<string, string> = {
    equinor: m.home.trackEquinor,
    'var-energi': m.home.trackVar,
    'aker-bp': m.home.trackAker,
  };

  return (
    <section aria-labelledby="track-h" className="flex flex-col items-center gap-4 py-16 nav:py-20">
      <h2 id="track-h" className="display m-0 text-center text-display-xl font-bold">
        {m.home.trackTitle}
      </h2>
      <p className="m-0 max-w-[680px] text-center text-[17px] text-muted">
        {t(m.home.trackLede, { quarters })}
      </p>
      {pending ? (
        <div className="mt-8 grid w-full max-w-[1100px] gap-5 nav:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      ) : (
        <ul className="m-0 mt-8 grid w-full max-w-[1100px] list-none gap-5 p-0 nav:grid-cols-3">
          {rows.map((r, i) => (
            <li key={r.id} className="card enter flex flex-col gap-2 p-7" style={{ '--i': i }}>
              <span className="text-[14px] font-semibold text-muted">{name(r.id)}</span>
              <span className="display num text-[56px] font-bold leading-none tracking-[-0.045em]">
                {r.summary.meanAbsGap === null
                  ? '–'
                  : formatPct(r.summary.meanAbsGap, r.summary.meanAbsGap < 1 ? 2 : 1)}
              </span>
              <span className="text-[14px] text-muted">
                <Term id="gap">{m.home.trackGap}</Term> ·{' '}
                {plural(m.home.trackQuarters, r.summary.complete)}
              </span>
              <p className="m-0 mt-1 text-[15px] text-muted">{notes[r.id]}</p>
            </li>
          ))}
        </ul>
      )}
      <Link to="/track-record" className="btn btn-primary mt-4">
        {m.home.trackCta}
      </Link>
    </section>
  );
}
