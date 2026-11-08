-- Oil equivalent: 1 Sm³ oil = NGL = condensate = 1 Sm³ o.e.; 1000 Sm³ gas = 1 Sm³ o.e.
-- Verified against Sodir's own o.e. column (tests/assert_oe_matches_sodir.sql).
with coverage as (
    select field_id, month, sum(effective_share_pct) as ownership_coverage_pct
    from {{ ref('int_field_month_shares') }}
    group by field_id, month
),

volumes as (
    select
        p.*,
        extract(day from (p.month + interval '1 month' - interval '1 day'))::int as days_in_month,
        p.oil_sm3 + p.ngl_sm3 + p.condensate_sm3 + p.gas_sm3 / 1000 as oe_sm3
    from {{ ref('stg_sodir__production_monthly') }} as p
)

select
    v.field_id,
    v.month,
    v.days_in_month,
    v.oil_sm3,
    v.gas_sm3,
    v.ngl_sm3,
    v.condensate_sm3,
    v.gas_sm3 / 1000 as gas_oe_sm3,
    v.oe_sm3,
    v.oe_sm3_sodir,
    {{ boe_per_day('v.oe_sm3', 'v.days_in_month') }} as boe_per_day,
    v.produced_water_sm3,
    coalesce(c.ownership_coverage_pct, 0) as ownership_coverage_pct
from volumes as v
left join coverage as c on c.field_id = v.field_id and c.month = v.month
