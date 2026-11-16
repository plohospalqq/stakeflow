{#-
    Fields a decline model cannot see or cannot fit yet, which is where the quarterly nowcast
    misses most (Vår Energi, Q3 2025: Johan Castberg and the Balder redevelopment).

    approved  the plan for development is approved, nothing produced in the last year. Covers
              new fields (Fenris, Hugin) and old ones being redeveloped (Vest Ekofisk), which is
              why it looks at recent production, not at "has never produced".
    ramping   under 12 months of production: the forecast holds it at its best recent month,
              because there is no decline to fit yet (field_model.py, status too_short).

    Sodir publishes no expected start date or volume in these tables, so this is a watchlist,
    not a forecast.
-#}
with latest as (
    select max(month) as month from {{ ref('fct_field_production_monthly') }}
),

approved as (
    select field_id, max(valid_from) as approved_on
    from {{ ref('stg_sodir__field_status_history') }}
    where status = 'Approved for production' and valid_to = date '9999-12-31'
    group by field_id
),

staged as (
    select
        f.field_id,
        f.name,
        f.factpage_url,
        f.first_production_month,
        f.last_production_month,
        a.approved_on,
        l.month as latest_month,
        case
            when f.status = 'Approved for production'
                and (f.last_production_month is null
                     or f.last_production_month <= (l.month - interval '12 months')::date)
                then 'approved'
            when f.first_production_month > (l.month - interval '11 months')::date
                then 'ramping'
        end as stage
    from {{ ref('dim_field') }} as f
    cross join latest as l
    left join approved as a on a.field_id = f.field_id
)

select
    s.field_id,
    s.name,
    s.stage,
    case when s.stage = 'approved' then s.approved_on end as approved_on,
    case when s.stage = 'ramping' then s.first_production_month end as first_production_month,
    case
        when s.stage = 'ramping' then
            (extract(year from age(s.latest_month, s.first_production_month)) * 12
             + extract(month from age(s.latest_month, s.first_production_month)))::int + 1
    end as months_producing,
    case when s.stage = 'ramping' then p.boe_per_day end as latest_boe_per_day,
    s.factpage_url
from staged as s
left join {{ ref('fct_field_production_monthly') }} as p
    on p.field_id = s.field_id and p.month = s.latest_month
where s.stage is not null
