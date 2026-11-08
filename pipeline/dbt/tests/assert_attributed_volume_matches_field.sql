-- Σ company volumes for a field-month = field volume × ownership coverage. Nothing lost or invented.
with attributed as (
    select field_id, month, sum(oe_sm3) as attributed_oe_sm3
    from {{ ref('fct_company_field_production_monthly') }}
    group by field_id, month
)

select p.field_id, p.month, p.oe_sm3, p.ownership_coverage_pct, a.attributed_oe_sm3
from {{ ref('fct_field_production_monthly') }} as p
left join attributed as a on a.field_id = p.field_id and a.month = p.month
where abs(coalesce(a.attributed_oe_sm3, 0) - p.oe_sm3 * p.ownership_coverage_pct / 100) > 1
