interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Inline error for a section that failed to load; the rest of the page keeps working. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-[13px] text-muted ${className ?? ''}`}
    >
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
