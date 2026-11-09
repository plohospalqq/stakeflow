import { useField } from '@/api/hooks';
import type { ShelfSummary } from '@/api/types.summary';
import { Term } from '@/components/Term';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useUnits } from '@/hooks/useUnits';
import { Rich } from '@/i18n/Rich';
import { useI18n } from '@/i18n/useI18n';
import { FOCUS_ORDER } from '@/lib/companies';
import { formatNumber } from '@/lib/format';
import { largestOilField } from '@/lib/plain';

/** Field output × ownership share = the company, with a real example from the latest month. */
export function HowItWorks({ summary }: { summary: ShelfSummary | undefined }) {
  const { m } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const oil = summary ? largestOilField(summary) : null;
  const field = useField(oil ? oil.field.id : NaN);

  const owner = FOCUS_ORDER.map((id) => ({
    id,
    share: (field.data?.currentOwners ?? [])
      .filter((o) => o.groupId === id)
      .reduce((s, o) => s + o.sharePct, 0),
  })).find((o) => o.share > 0);
  const fieldKboed = oil ? oil.field.boePerDay / 1000 : 0;

  const steps = [
    {
      title: m.home.howField,
      text: m.home.howFieldText,
      color: 'var(--oil)',
      term: 'field' as const,
    },
    {
      title: m.home.howShare,
      text: m.home.howShareText,
      color: 'var(--gas)',
      term: 'licenceShare' as const,
    },
    {
      title: m.home.howCompany,
      text: m.home.howCompanyText,
      color: 'var(--cnd)',
      term: 'attributed' as const,
    },
  ];

  return (
    <section aria-labelledby="how-h" className="flex flex-col items-center gap-4 py-16 nav:py-20">
      <h2 id="how-h" className="display m-0 text-center text-display-xl font-bold">
        {m.home.howTitle}
      </h2>
      <p className="m-0 text-center text-[17px] text-muted">{m.home.howLede}</p>
      <ol className="m-0 mt-8 grid w-full max-w-[1100px] list-none gap-5 p-0 nav:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="card enter flex flex-col gap-3 p-7" style={{ '--i': i }}>
            <span
              className="display num flex h-11 w-11 items-center justify-center rounded-full text-[18px] font-bold text-white"
              style={{ background: s.color }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <h3 className="display m-0 text-[26px] font-semibold tracking-[-0.03em]">{s.title}</h3>
            <p className="m-0 text-[16px] text-muted">
              {s.text} <Term id={s.term}>{m.glossary[s.term].term}</Term>
            </p>
          </li>
        ))}
      </ol>
      {oil && owner ? (
        <p className="card m-0 mt-2 w-full max-w-[1100px] px-7 py-5 text-[17px] leading-[1.5] text-muted">
          <Rich
            text={m.home.howExample}
            vars={{
              field: oil.field.name,
              fieldValue: units.format(units.fromRate(fieldKboed)),
              company: name(owner.id),
              share: `${formatNumber(owner.share, 1)}%`,
              companyValue: units.format(units.fromRate((fieldKboed * owner.share) / 100)),
              unit: units.label,
            }}
          />
        </p>
      ) : null}
    </section>
  );
}
