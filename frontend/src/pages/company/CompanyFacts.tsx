import type { CompanyDetail } from '@/api/types';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { useReportKind } from '@/hooks/useCompanyName';
import { useI18n } from '@/i18n/useI18n';
import { COMPANY_META } from '@/lib/companies';

/** Scope and the legal entities behind the group: what exactly is being added up. */
export function CompanyFacts({ company }: { company: CompanyDetail | undefined }) {
  const { m, t } = useI18n();
  const reportKind = useReportKind();
  const meta = company ? COMPANY_META[company.id] : undefined;
  const notes: Record<string, string> = {
    equinor: m.companyMeta.notes.equinor,
    'var-energi': m.companyMeta.notes.varEnergi,
    'aker-bp': m.companyMeta.notes.akerBp,
  };
  const note = company ? notes[company.id] : undefined;
  return (
    <aside className="card enter flex min-w-0 flex-col gap-3 p-5" aria-labelledby="cf-h">
      <h2 id="cf-h" className="display m-0 text-h2 font-semibold">
        {m.company.factsTitle}
      </h2>
      {!company ? (
        <Skeleton height={160} />
      ) : (
        <>
          {note ? (
            <p className="m-0 text-[14px] text-muted">{note}</p>
          ) : company.scopeNote ? (
            // Other companies' scope notes come from the API, in English.
            <p lang="en" className="m-0 text-[14px] text-muted">
              {company.scopeNote}
            </p>
          ) : null}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>{m.company.producingFields}</dt>
            <dd className="num">{company.producingFieldCount}</dd>
            {meta ? (
              <>
                <dt>{m.company.firstPublishes}</dt>
                <dd>
                  {meta.reportKind === 'trading update' ? (
                    <Term id="tradingUpdate">
                      {t(m.company.its, { kind: reportKind(meta.reportKind) })}
                    </Term>
                  ) : (
                    t(m.company.its, { kind: reportKind(meta.reportKind) })
                  )}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="cap">{m.company.legalEntities}</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
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
                      className="inline-flex min-h-[32px] items-center gap-1 text-[13px] text-muted underline underline-offset-2 hover:text-ink"
                    >
                      {m.company.factpages}
                      <Icon name="external" size={12} />
                      <span className="sr-only">
                        {t(m.company.factpagesFor, { name: e.name })} {m.common.opensNewTab}
                      </span>
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
