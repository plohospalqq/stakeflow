import { Link } from 'react-router';
import { useCompanyQuarters, usePredictionLog } from '@/api/hooks';
import { Icon } from '@/components/Icon';
import { SampleBadge } from '@/components/SampleBadge';
import { formatPct, formatQuarter } from '@/lib/format';
import { modelStats } from '@/lib/trackRecord';

export function TrackTeaser() {
  const log = usePredictionLog();
  const aker = useCompanyQuarters('aker-bp');
  const var_ = useCompanyQuarters('var-energi');
  const stats = log.data ? modelStats(log.data) : null;
  const reconciled = [...(aker.data ?? []), ...(var_.data ?? [])].filter(
    (q) => q.errorPct !== null,
  );
  const reconError =
    reconciled.length > 0
      ? reconciled.reduce((s, q) => s + Math.abs(q.errorPct ?? 0), 0) / reconciled.length
      : null;

  return (
    <section
      className="card flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4"
      aria-labelledby="tr-h"
    >
      <div className="flex items-center gap-3.5">
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-control bg-[color-mix(in_srgb,var(--up)_14%,transparent)] text-up">
          <Icon name="shield" size={20} />
        </span>
        <div className="flex flex-col">
          <h2 id="tr-h" className="m-0 text-[14px] font-semibold">
            Every nowcast is frozen at quarter end
          </h2>
          <span className="lbl text-[13px]">
            Timestamped and hashed, then scored against the company&apos;s trading update.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-7">
        <div>
          <div className="num text-[20px] font-semibold">
            {reconError !== null ? formatPct(reconError, 1) : '–'}
          </div>
          <div className="lbl">
            Sodir vs reported, {reconciled.length} quarter{reconciled.length === 1 ? '' : 's'}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="num text-[20px] font-semibold">
              {stats ? formatPct(stats.modelError, 1) : '–'}
            </span>
            <SampleBadge />
          </div>
          <div className="lbl">Model avg. error, {stats?.resolved ?? 0} predictions</div>
        </div>
        <div>
          <div className="num text-[20px] font-semibold text-muted">
            {stats ? formatPct(stats.baselineError, 1) : '–'}
          </div>
          <div className="lbl">Simple guess (last quarter)</div>
        </div>
        {stats ? (
          <div>
            <div className="num text-[20px] font-semibold">{stats.quarters} quarters</div>
            <div className="lbl">
              {formatQuarter(stats.firstQuarter)} – {formatQuarter(stats.lastQuarter)}
            </div>
          </div>
        ) : null}
      </div>
      <Link to="/track-record" className="btn">
        See every prediction
      </Link>
    </section>
  );
}
