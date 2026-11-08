-- SCD Type 2: one row per (field, company, period), valid_to exclusive, 9999-12-31 = current
select
    md5(o.field_id::text || '-' || o.company_id::text || '-' || o.valid_from::text) as ownership_id,
    o.field_id,
    o.company_id,
    g.group_id,
    o.valid_from,
    o.valid_to,
    o.share_pct,
    o.sdfi_share_pct,
    o.valid_to = date '9999-12-31' as is_current
from {{ ref('stg_sodir__field_licensees') }} as o
inner join {{ ref('int_company_groups') }} as g on g.company_id = o.company_id
