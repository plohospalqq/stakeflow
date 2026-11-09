-- The latest anomaly run: method version, parameters and the window it looked at
select
    run_id,
    run_at,
    model_version,
    params,
    latest_month,
    evaluated_from,
    flagged_from,
    fields_evaluated,
    anomaly_count
from {{ source('ml', 'anomaly_runs') }}
order by run_at desc
limit 1
