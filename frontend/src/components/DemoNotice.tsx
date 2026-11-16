import { useSnapshotInfo } from '@/api/hooks';
import { IS_STATIC_DEMO } from '@/api/mode';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, formatMonth } from '@/lib/format';

const REPO_URL = 'https://github.com/plohospalqq/stakeflow';

/**
 * The GitHub Pages build serves a frozen export of the real API. Say so on every page, with
 * the data month and the export date, so nobody takes it for a live feed.
 */
export function DemoNotice() {
  const { m, t } = useI18n();
  const snapshot = useSnapshotInfo();
  if (!IS_STATIC_DEMO) return null;
  const info = snapshot.data;
  return (
    <aside
      aria-label={m.demoNotice.label}
      className="border-b border-line bg-surface2 px-4 py-1.5 text-center text-[12px] text-muted"
    >
      <strong className="font-semibold text-ink">{m.demoNotice.title}</strong>
      {info ? (
        <>
          {' '}
          · {t(m.demoNotice.dataThrough, { month: formatMonth(info.latestMonth) })} ·{' '}
          {t(m.demoNotice.snapshot, { date: formatDate(info.generatedAt) })}
          {info.source === 'live' ? null : ` · ${m.demoNotice.ciSample}`}
        </>
      ) : null}{' '}
      ·{' '}
      <a className="underline underline-offset-2" href={REPO_URL}>
        {m.demoNotice.run}
      </a>
    </aside>
  );
}
