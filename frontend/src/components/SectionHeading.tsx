import type { ReactNode } from 'react';

interface SectionHeadingProps {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

/** h2 + muted subtitle (which carries the unit) in a card header row. */
export function SectionHeading({ id, title, sub, actions }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pb-1.5 pt-4">
      <div className="flex min-w-0 flex-col">
        <h2 id={id} className="m-0 flex flex-wrap items-center gap-2 text-h2">
          {title}
        </h2>
        {sub ? <span className="lbl">{sub}</span> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
