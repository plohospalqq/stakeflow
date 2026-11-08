-- Curated groups (seed) plus one single-company group for everyone else
select group_id, display_name, is_focus, scope_note
from {{ ref('company_groups') }}

union all

select distinct group_id, group_display_name, false, null::text
from {{ ref('int_company_groups') }}
where not is_curated
