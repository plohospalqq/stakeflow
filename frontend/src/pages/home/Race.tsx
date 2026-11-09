import { Link } from 'react-router';
import { useCompanies, useCompanyFields } from '@/api/hooks';
import type { Company } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { Skeleton } from '@/components/Skeleton';
import { useCompanyName } from '@/hooks/useCompanyName';
import { useReveal } from '@/hooks/useMotion';
import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { RACE_ORDER } from '@/lib/companies';
import { addMonths } from '@/lib/dates';
import { explainChange, fieldMoves } from '@/lib/explain';
import { formatMonthLong, formatMonthName } from '@/lib/format';
import { latestView } from '@/lib/latest';

function WhatMoved({ company }: { company: Company }) {
  const { m } = useI18n();
  const units = useUnits();
  const latest = company.latest;
  const previous = latest ? addMonths(latest.month, -1) : undefined;
  const fields = useCompanyFields(company.id, previous ? { start: previous } : undefined);
  if (!latest || !previous || !fields.data) return null;
  const sentence = explainChange(
    fieldMoves(fields.data, latest.month, previous, units.fromMonth),
    formatMonthName(previous),
    units.label,
    m.explain,
    units.digits,
  );
  return sentence ? <p className="m-0 text-[14px] text-muted">{sentence}</p> : null;
}

/**
 * "Three companies. One shelf." Bars share one scale so their lengths compare; each bar is
 * split into oil, gas and NGL by the company's own product mix (product colours stay
 * reserved for products).
 */
export function Race() {
  const { m, t } = useI18n();
  const units = useUnits();
  const name = useCompanyName();
  const companies = useCompanies(true);
  const [ref, reveal] = useReveal<HTMLOListElement>();

  const rows = RACE_ORDER.flatMap((id) => {
    const c = companies.data?.find((x) => x.id === id);
    return c?.latest ? [{ company: c, view: latestView(c.latest, units.unit) }] : [];
  }).sort((a, b) => b.view.value - a.view.value);
  const max = Math.max(...rows.map((r) => r.view.value), 1);
  const month = rows[0]?.view.month;

  return (
    <section aria-labelledby="race-h" className="flex flex-col items-center gap-4 py-16 nav:py-24">
      <h2 id="race-h" className="display m-0 text-center text-display-xl font-bold">
        {m.home.raceTitle}
        <br />
        <span className="text-muted">{m.home.raceTitleDim}</span>
      </h2>
      {month ? (
        <p className="m-0 max-w-[620px] text-center text-[17px] text-muted">
          {t(m.home.raceLede, { unit: units.label, month: formatMonthLong(month) })}
        </p>
      ) : null}
      {companies.isPending ? (
        <div className="mt-10 flex w-full max-w-[920px] flex-col gap-8">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : (
        <ol
          ref={ref}
          data-reveal={reveal}
          className="m-0 mt-10 flex w-full max-w-[920px] list-none flex-col gap-9 p-0"
        >
          {rows.map(({ company, view }, i) => {
            const mix = company.latest?.mix ?? { oil: 0, gas: 0, nglCond: 0 };
            const width = (view.value / max) * 100;
            return (
              <li key={company.id} className="flex flex-col gap-2">
                <div className="grid grid-cols-1 items-center gap-x-6 gap-y-2 nav:grid-cols-[230px_1fr_170px]">
                  <Link
                    to={`/companies/${company.id}`}
                    className="display flex min-h-[44px] min-w-0 items-center break-words text-[24px] font-semibold tracking-[-0.025em] text-ink no-underline hover:underline"
                  >
                    {/* Wraps instead of truncating: the scope label is part of the name. */}
                    {name(company.id, company.name)}
                  </Link>
                  <div
                    className="h-3.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--tx)_8%,transparent)]"
                    aria-hidden="true"
                  >
                    <div
                      className="grow-x flex h-full origin-left gap-[2px] overflow-hidden rounded-full"
                      style={{ width: `${width}%`, '--i': i }}
                    >
                      <span style={{ width: `${mix.oil * 100}%`, background: 'var(--oil)' }} />
                      <span style={{ width: `${mix.gas * 100}%`, background: 'var(--gas)' }} />
                      <span style={{ width: `${mix.nglCond * 100}%`, background: 'var(--cnd)' }} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 nav:flex-col nav:items-end nav:gap-1">
                    <span className="display num text-[30px] font-semibold leading-none tracking-[-0.03em]">
                      {units.format(view.value)}
                      <span className="ml-1.5 text-[13px] font-medium tracking-normal text-muted">
                        {units.label}
                      </span>
                    </span>
                    {view.momPct !== null ? (
                      <span className="flex items-center gap-1.5 text-[13px] text-muted">
                        <DeltaBadge value={view.momPct} />
                        {t(m.common.vsMonth, {
                          month: formatMonthName(addMonths(view.month, -1)),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="nav:pl-[254px]">
                  <WhatMoved company={company} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <ul className="m-0 mt-6 flex list-none flex-wrap justify-center gap-x-5 gap-y-1 p-0 text-[13px] text-muted">
        <li className="flex items-center gap-1.5">
          <span className="dot bg-oil" aria-hidden="true" />
          {m.products.oil}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="dot bg-gas" aria-hidden="true" />
          {m.products.gas}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="dot bg-cond" aria-hidden="true" />
          {m.products.nglCond}
        </li>
      </ul>
    </section>
  );
}
