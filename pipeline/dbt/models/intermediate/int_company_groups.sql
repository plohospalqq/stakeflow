-- Every company mapped to a group: curated groups from the seed, otherwise its own group
select
    c.company_id,
    coalesce(m.group_id, 'c' || c.company_id::text) as group_id,
    coalesce(g.display_name, c.name) as group_display_name,
    coalesce(g.is_focus, false) as is_focus,
    m.group_id is not null as is_curated
from {{ ref('stg_sodir__companies') }} as c
left join {{ ref('company_group_members') }} as m on m.company_id = c.company_id
left join {{ ref('company_groups') }} as g on g.group_id = m.group_id
