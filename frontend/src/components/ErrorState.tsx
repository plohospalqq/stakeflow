import { useI18n } from '@/i18n/useI18n';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Inline error for a section that failed to load; the rest of the page keeps working. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const { m } = useI18n();
  return (
    <div
      role="alert"
      className={`card flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[14px] text-muted ${className ?? ''}`}
    >
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          {m.common.tryAgain}
        </button>
      ) : null}
    </div>
  );
}
