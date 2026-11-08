-- One row per (field, company, period). Sodir's "to" date is inclusive; we convert to an
-- exclusive end so intervals chain without gaps: [valid_from, valid_to).
select
    (a->>'fldNpdidField')::int as field_id,
    (a->>'cmpNpdidCompany')::int as company_id,
    {{ epoch_ms_to_date("a->>'fldLicenseeFrom'") }} as valid_from,
    coalesce(
        {{ epoch_ms_to_date("a->>'fldLicenseeTo'") }} + 1,
        date '9999-12-31'
    ) as valid_to,
    (a->>'fldCompanyShare')::numeric as share_pct,
    (a->>'fldSdfiShare')::numeric as sdfi_share_pct
from {{ latest_snapshot('field_licensee_hst') }} as s
