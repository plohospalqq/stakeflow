import type { ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional count shown after the label, e.g. filter results. */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Units". */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of toggle buttons where exactly one is pressed. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-control border border-line bg-surface2 p-[3px] ${className ?? ''}`}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[12.5px] font-medium max-nav:min-h-[38px] ${
              on ? 'bg-surface3 text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="num text-[12px] text-muted">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
