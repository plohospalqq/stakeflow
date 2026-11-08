-- Field volume × the company's day-weighted share that month
select
    s.company_id,
    g.group_id,
    s.field_id,
    s.month,
    s.effective_share_pct,
    p.oil_sm3 * s.effective_share_pct / 100 as oil_sm3,
    p.gas_sm3 * s.effective_share_pct / 100 as gas_sm3,
    p.ngl_sm3 * s.effective_share_pct / 100 as ngl_sm3,
    p.condensate_sm3 * s.effective_share_pct / 100 as condensate_sm3,
    p.gas_oe_sm3 * s.effective_share_pct / 100 as gas_oe_sm3,
    p.oe_sm3 * s.effective_share_pct / 100 as oe_sm3,
    p.boe_per_day * s.effective_share_pct / 100 as boe_per_day
from {{ ref('int_field_month_shares') }} as s
inner join {{ ref('fct_field_production_monthly') }} as p
    on p.field_id = s.field_id and p.month = s.month
inner join {{ ref('int_company_groups') }} as g on g.company_id = s.company_id
