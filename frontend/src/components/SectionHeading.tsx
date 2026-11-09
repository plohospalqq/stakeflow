import type { ReactNode } from 'react';

interface SectionHeadingProps {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

/** h2 + muted subtitle (which carries the unit) in a tile header row. */
export function SectionHeading({ id, title, sub, actions }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="display m-0 flex flex-wrap items-center gap-2 text-h2 font-semibold">
          {title}
        </h2>
        {sub ? <span className="lbl">{sub}</span> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
