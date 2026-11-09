import type { ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional count shown after the label, e.g. filter results. */
  count?: number;
  /** Accessible name when the label is not plain text (e.g. 'English' for 'EN'). */
  ariaLabel?: string;
  /** Language of the label, when it differs from the page (language names). */
  lang?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Units". */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/** iOS-style segmented control: a row of toggle buttons where exactly one is pressed. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--tx)_7%,transparent)] p-[3px] ${className ?? ''}`}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            aria-label={option.ariaLabel}
            lang={option.lang}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[background,color,box-shadow] duration-200 ${
              size === 'sm'
                ? 'min-h-[30px] px-2.5 text-[12.5px] max-nav:min-h-[44px] max-nav:px-3'
                : 'min-h-[34px] px-3.5 text-[13px] max-nav:min-h-[44px]'
            } ${
              on
                ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.14)] [.t-dark_&]:bg-surface3'
                : 'text-muted hover:text-ink'
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
