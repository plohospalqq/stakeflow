import { useFreshness } from '@/api/hooks';
import { useI18n } from '@/i18n/useI18n';
import { formatDayMonth, formatMonth, formatMonthLong } from '@/lib/format';
import { nextReleaseWindow } from '@/lib/release';

/** "Sodir · through Aug 2026", or what is going on while that is unknown. */
export function FreshnessText() {
  const { m, t } = useI18n();
  const freshness = useFreshness();
  if (freshness.isError) return <>{m.freshness.unavailable}</>;
  const latest = freshness.data?.latestMonth;
  if (!latest) return <>{m.freshness.checking}</>;
  return <>{t(m.freshness.through, { month: formatMonth(latest) })}</>;
}

/** One sentence: data through which month, and when the next one is due. */
export function FreshnessSentence({ latestMonth }: { latestMonth: string }) {
  const { m, t } = useI18n();
  const w = nextReleaseWindow(latestMonth);
  return (
    <>
      {t(m.freshness.line, {
        month: formatMonthLong(latestMonth),
        from: formatDayMonth(w.from),
        to: formatDayMonth(w.to),
      })}
    </>
  );
}
