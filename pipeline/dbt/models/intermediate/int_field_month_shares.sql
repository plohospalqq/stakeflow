-- Day-weighted ownership share per (field, company, month).
-- A company holding 20% for 29 of 30 days gets 19.3333% of that month's volume.
with months as (
    select distinct
        field_id,
        month,
        (month + interval '1 month')::date as next_month,
        extract(day from (month + interval '1 month' - interval '1 day'))::int as days_in_month
    from {{ ref('stg_sodir__production_monthly') }}
),

held as (
    select
        m.field_id,
        m.month,
        m.days_in_month,
        o.company_id,
        o.share_pct,
        least(o.valid_to, m.next_month) - greatest(o.valid_from, m.month) as days_held
    from months as m
    inner join {{ ref('stg_sodir__field_licensees') }} as o
        on o.field_id = m.field_id
        and o.valid_from < m.next_month
        and o.valid_to > m.month
)

select
    field_id,
    month,
    company_id,
    sum(share_pct * days_held) / max(days_in_month) as effective_share_pct
from held
group by field_id, month, company_id
