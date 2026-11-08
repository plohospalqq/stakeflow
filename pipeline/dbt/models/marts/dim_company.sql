select
    c.company_id,
    c.name,
    c.short_name,
    c.org_number,
    c.nation_code,
    g.group_id,
    c.factpage_url
from {{ ref('stg_sodir__companies') }} as c
inner join {{ ref('int_company_groups') }} as g on g.company_id = c.company_id
