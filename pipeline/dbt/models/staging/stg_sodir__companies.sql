select
    (a->>'cmpNpdidCompany')::int as company_id,
    a->>'cmpLongName' as name,
    a->>'cmpShortName' as short_name,
    a->>'cmpOrgNumberBrReg' as org_number,
    a->>'cmpNationCode' as nation_code,
    -- Sodir's own grouping is inconsistent (typos, trailing spaces); kept for reference only.
    -- Real grouping comes from the company_group_members seed.
    trim(a->>'cmpGroup') as sodir_group_label,
    a->>'cmpFactPageUrl' as factpage_url
from {{ latest_snapshot('company') }} as s
