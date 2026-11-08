-- Company groups per month (what the API and UI call "company")
select
    group_id,
    month,
    sum(oil_sm3) as oil_sm3,
    sum(gas_sm3) as gas_sm3,
    sum(ngl_sm3) as ngl_sm3,
    sum(condensate_sm3) as condensate_sm3,
    sum(gas_oe_sm3) as gas_oe_sm3,
    sum(oe_sm3) as oe_sm3,
    sum(boe_per_day) as boe_per_day,
    count(distinct field_id) filter (where oe_sm3 > 0) as producing_field_count
from {{ ref('fct_company_field_production_monthly') }}
group by group_id, month
