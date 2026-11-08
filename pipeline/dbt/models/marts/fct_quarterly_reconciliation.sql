-- Sodir-attributed production per company group and quarter, next to what the company reported.
-- Quarter average boe/d = total o.e. over the quarter × 6.2898 ÷ days in the quarter covered.
with quarterly as (
    select
        group_id,
        date_trunc('quarter', month)::date as quarter_start,
        count(*) as months_in_data,
        sum(oe_sm3) as oe_sm3,
        sum(extract(day from (month + interval '1 month' - interval '1 day'))) as days_covered
    from {{ ref('fct_group_production_monthly') }}
    group by 1, 2
)

select
    q.group_id,
    q.quarter_start,
    q.months_in_data,
    q.months_in_data = 3 as is_complete,
    round((q.oe_sm3 * 6.2898 / q.days_covered / 1000)::numeric, 1) as attributed_kboe_d,
    r.reported_kboe_d,
    round((100 * (q.oe_sm3 * 6.2898 / q.days_covered / 1000 - r.reported_kboe_d) / r.reported_kboe_d)::numeric, 2)
        as error_pct,
    r.published_on as reported_on,
    r.source_url
from quarterly as q
left join {{ ref('reported_quarterly_production') }} as r
    on r.group_id = q.group_id and r.quarter_start = q.quarter_start
