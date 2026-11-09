import { Icon, type IconName } from '@/components/Icon';
import { useI18n } from '@/i18n/useI18n';

interface TrustItem {
  icon: IconName;
  title: string;
  text: string;
}

/** The four promises that make the log worth reading. */
export function TrustItems({ averageLead }: { averageLead: number | null }) {
  const { m, t } = useI18n();
  const items: TrustItem[] = [
    {
      icon: 'lock',
      title: m.track.frozen,
      text: averageLead !== null ? t(m.track.frozenLead, { n: averageLead }) : m.track.frozenText,
    },
    { icon: 'commit', title: m.track.hashed, text: m.track.hashedText },
    { icon: 'scale', title: m.track.baseline, text: m.track.baselineText },
    { icon: 'edit', title: m.track.never, text: m.track.neverText },
  ];
  return (
    <section
      aria-labelledby="trust-h"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3"
    >
      <h2 id="trust-h" className="sr-only">
        {m.track.trustTitle}
      </h2>
      {items.map((item, i) => (
        <div key={item.title} className="card enter flex gap-3 p-5" style={{ '--i': i }}>
          <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-surface2 text-ink">
            <Icon name={item.icon} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="m-0 text-[15px] font-semibold">{item.title}</h3>
            <p className="lbl m-0">{item.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
