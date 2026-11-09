-- Every field-month the latest run judged: actual vs expected and the band (mini charts)
select
    e.field_id,
    e.month,
    e.actual_boe_d,
    e.expected_boe_d,
    e.lo_boe_d,
    e.hi_boe_d,
    e.sigma_log,
    e.pct_vs_expected,
    e.seasonal,
    e.is_anomaly,
    e.severity,
    e.excluded_reason
from {{ source('ml', 'anomaly_evaluations') }} as e
inner join {{ ref('meta_anomaly_run') }} as r on r.run_id = e.run_id
