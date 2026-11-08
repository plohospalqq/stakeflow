import type { CompanyDetail } from '@/api/types';
import { Icon } from '@/components/Icon';
import { MixBar } from '@/components/MixBar';
import { Skeleton } from '@/components/Skeleton';
import { COMPANY_META } from '@/lib/companies';
import { formatMonth } from '@/lib/format';

/** Scope and the legal entities behind the group: what exactly is being added up. */
export function CompanyFacts({ company }: { company: CompanyDetail | undefined }) {
  return (
    <aside
      className="card flex min-w-0 flex-[2_1_380px] flex-col gap-3 px-[18px] py-4"
      aria-labelledby="cf-h"
    >
      <h2 id="cf-h" className="m-0 text-h2">
        What is counted
      </h2>
      {!company ? (
        <Skeleton height={160} />
      ) : (
        <>
          {company.scopeNote ? (
            <p className="m-0 text-[13px] text-muted">{company.scopeNote}</p>
          ) : null}
          {company.latest ? (
            <div className="flex flex-col gap-1.5">
              <span className="lbl">Product mix, {formatMonth(company.latest.month)}</span>
              <MixBar mix={company.latest.mix} showLegend />
            </div>
          ) : null}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>Producing fields</dt>
            <dd className="num">{company.producingFieldCount}</dd>
            {COMPANY_META[company.id] ? (
              <>
                <dt>First publishes production in</dt>
                <dd>{`its ${COMPANY_META[company.id]?.reportKind ?? 'quarterly report'}`}</dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <span className="cap">Legal entities in Sodir</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              {company.legalEntities.map((e) => (
                <li
                  key={e.companyId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3"
                >
                  <span>{e.name}</span>
                  {/* factpageUrl is null unless it passed safeExternalUrl in the API mapping. */}
                  {e.factpageUrl ? (
                    <a
                      href={e.factpageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink"
                    >
                      FactPages
                      <Icon name="external" size={12} />
                      <span className="sr-only">for {e.name} (opens in a new tab)</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
