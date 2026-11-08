import { Icon, type IconName } from '@/components/Icon';

interface TrustItem {
  icon: IconName;
  title: string;
  text: string;
}

/** The four promises that make the log worth reading. */
export function TrustItems({ averageLead }: { averageLead: number | null }) {
  const items: TrustItem[] = [
    {
      icon: 'lock',
      title: 'Frozen at quarter end',
      text: `Locked at 23:59 UTC on the last day of the quarter${
        averageLead !== null ? `, on average ${averageLead} days before the company publishes` : ''
      }.`,
    },
    {
      icon: 'commit',
      title: 'Hashed for a public log',
      text: "Each prediction's hash goes into a public Git log, so it cannot be changed quietly.",
    },
    {
      icon: 'scale',
      title: 'Compared with a simple guess',
      text: "Baseline: last quarter's reported number, unchanged.",
    },
    {
      icon: 'edit',
      title: 'Never edited',
      text: 'Misses stay on the page. Revisions are added as new rows.',
    },
  ];
  return (
    <section
      aria-labelledby="trust-h"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3"
    >
      <h2 id="trust-h" className="sr-only">
        How predictions are kept honest
      </h2>
      {items.map((item) => (
        <div key={item.title} className="card flex gap-3 px-4 py-3.5">
          <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-control bg-surface2 text-muted">
            <Icon name={item.icon} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="m-0 text-[13px] font-semibold">{item.title}</h3>
            <p className="lbl m-0">{item.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
