-- Every quarterly prediction next to what happened, scored two ways:
--   * against what the company reported (trading update): the public test;
--   * against the Sodir-attributed figure once all three months are in: more quarters, and it
--     isolates forecasting skill from the ~1% equity-vs-entitlement gap between the two.
-- Baseline ("simple guess") = the same quarter-before figure, known at the freeze date.
with reported as (
    select group_id, quarter_start, reported_kboe_d, published_on
    from {{ ref('reported_quarterly_production') }}
),

attributed as (
    select group_id, quarter_start, attributed_kboe_d
    from {{ ref('fct_quarterly_reconciliation') }}
    where is_complete
),

predictions as (
    select
        p.*,
        (p.quarter_start + interval '3 months' - interval '1 day')::date as quarter_end,
        (p.quarter_start - interval '3 months')::date as previous_quarter_start,
        -- Revisions are new rows; the newest one per quarter, kind and model is the one scored
        row_number() over (
            partition by p.group_id, p.quarter_start, p.kind, p.model_version
            order by p.predicted_at desc, p.id
        ) = 1 as is_latest
    from {{ source('ml', 'predictions') }} as p
)

select
    p.id as prediction_id,
    p.group_id,
    g.display_name as group_name,
    p.quarter_start,
    p.quarter_end,
    p.kind,
    p.model_version,
    p.is_latest,
    p.predicted_at,
    p.as_of,
    p.data_through,
    p.months_in_data,
    p.value_kboe_d,
    p.lo,
    p.hi,
    p.input_hash,
    p.prediction_hash,
    rc.report_kind,
    p.quarter_end + rc.report_lag_days as expected_report_on,
    r.reported_kboe_d as actual_kboe_d,
    r.published_on as reported_on,
    case when r.reported_kboe_d is null then 'open' else 'resolved' end as status,
    round(100 * (p.value_kboe_d - r.reported_kboe_d) / r.reported_kboe_d, 2) as error_pct,
    r.reported_kboe_d between p.lo and p.hi as in_range,
    rb.reported_kboe_d as baseline_kboe_d,
    round(100 * (rb.reported_kboe_d - r.reported_kboe_d) / r.reported_kboe_d, 2) as baseline_error_pct,
    a.attributed_kboe_d,
    round(100 * (p.value_kboe_d - a.attributed_kboe_d) / a.attributed_kboe_d, 2) as attributed_error_pct,
    a.attributed_kboe_d between p.lo and p.hi as attributed_in_range,
    ab.attributed_kboe_d as attributed_baseline_kboe_d,
    round(100 * (ab.attributed_kboe_d - a.attributed_kboe_d) / a.attributed_kboe_d, 2)
        as attributed_baseline_error_pct
from predictions as p
inner join {{ ref('dim_company_group') }} as g on g.group_id = p.group_id
left join {{ ref('company_reporting') }} as rc on rc.group_id = p.group_id
left join reported as r on r.group_id = p.group_id and r.quarter_start = p.quarter_start
left join reported as rb on rb.group_id = p.group_id and rb.quarter_start = p.previous_quarter_start
left join attributed as a on a.group_id = p.group_id and a.quarter_start = p.quarter_start
left join attributed as ab on ab.group_id = p.group_id and ab.quarter_start = p.previous_quarter_start
