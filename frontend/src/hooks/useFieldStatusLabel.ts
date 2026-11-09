import { useI18n } from '@/i18n/useI18n';

/** Sodir's field status in the reader's language; unknown statuses pass through as data. */
export function useFieldStatusLabel(): (status: string) => string {
  const { m } = useI18n();
  return (status) =>
    status === 'Producing' || status === 'Shut down' || status === 'Approved for production'
      ? m.fieldStatus[status]
      : status;
}
