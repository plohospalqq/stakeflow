-- Track record per kind and model version, per company and overall ('all').
-- Model and baseline are averaged over the same quarters (both must exist), so they compare 1:1.
with scored as (
    select *
    from {{ ref('fct_prediction_scores') }}
    where is_latest
)

select
    kind,
    model_version,
    coalesce(group_id, 'all') as group_id,
    count(*) as predictions,
    count(*) filter (where actual_kboe_d is not null) as scored_vs_reported,
    round(avg(abs(error_pct)) filter (where actual_kboe_d is not null), 2) as mape_vs_reported_pct,
    round(avg(error_pct) filter (where actual_kboe_d is not null), 2) as bias_vs_reported_pct,
    round(100 * avg(in_range::int) filter (where actual_kboe_d is not null), 1)
        as in_range_vs_reported_pct,
    count(*) filter (where baseline_error_pct is not null) as baseline_scored_vs_reported,
    round(avg(abs(error_pct)) filter (where baseline_error_pct is not null), 2)
        as mape_vs_reported_where_baseline_pct,
    round(avg(abs(baseline_error_pct)), 2) as baseline_mape_vs_reported_pct,
    count(*) filter (where attributed_kboe_d is not null) as scored_vs_attributed,
    round(avg(abs(attributed_error_pct)) filter (where attributed_kboe_d is not null), 2)
        as mape_vs_attributed_pct,
    round(avg(attributed_error_pct) filter (where attributed_kboe_d is not null), 2)
        as bias_vs_attributed_pct,
    round(100 * avg(attributed_in_range::int) filter (where attributed_kboe_d is not null), 1)
        as in_range_vs_attributed_pct,
    count(*) filter (where attributed_baseline_error_pct is not null)
        as baseline_scored_vs_attributed,
    round(avg(abs(attributed_error_pct)) filter (where attributed_baseline_error_pct is not null), 2)
        as mape_vs_attributed_where_baseline_pct,
    round(avg(abs(attributed_baseline_error_pct)), 2) as baseline_mape_vs_attributed_pct
from scored
group by grouping sets ((kind, model_version, group_id), (kind, model_version))
