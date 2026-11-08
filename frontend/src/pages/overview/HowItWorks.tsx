const STEPS = [
  { n: 1, title: 'Field output', sub: 'Monthly, per field (Sodir)' },
  { n: 2, title: '× ownership share', sub: 'Day-weighted licence records' },
  { n: 3, title: '= company + nowcast', sub: 'Frozen at quarter end' },
];

export function HowItWorks() {
  return (
    <section
      className="card flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4"
      aria-labelledby="how-h"
    >
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
        <h2 id="how-h" className="m-0 text-[14px] font-semibold">
          From oil fields to company numbers
        </h2>
        <p className="m-0 text-[13px] text-muted">
          Every month the Norwegian Offshore Directorate publishes how much each field produced. We
          split each field by who owns it, add it up per company, and freeze a forecast of each
          quarter at quarter end, scored against the company&apos;s trading update.
        </p>
      </div>
      <ol className="m-0 grid min-w-0 flex-[2_1_520px] list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5 p-0">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="flex items-center gap-2.5 rounded-control bg-surface2 px-3 py-2.5"
          >
            <span className="num inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line-strong text-[12px]">
              {s.n}
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-medium">{s.title}</span>
              <span className="lbl">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
