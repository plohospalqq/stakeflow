-- Project rule: Equinor numbers are NCS-only and must always say so
select group_id, display_name
from {{ ref('dim_company_group') }}
where group_id = 'equinor' and display_name not like '%(NCS only)%'
