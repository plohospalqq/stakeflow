-- Flagged months of the latest run (last 24 months), with field and operator names.
-- Status (new, investigating, ...) is not stored yet; the UI treats every anomaly as new.
select
    e.field_id::text || '-' || to_char(e.month, 'YYYY-MM') as anomaly_id,
    e.field_id,
    f.name as field_name,
    f.operator_group_id,
    og.display_name as operator_name,
    e.month,
    e.pct_vs_expected,
    e.severity,
    e.note,
    e.actual_boe_d,
    e.expected_boe_d,
    e.lo_boe_d,
    e.hi_boe_d,
    e.seasonal,
    r.run_id,
    r.run_at,
    r.model_version
from {{ source('ml', 'anomaly_evaluations') }} as e
inner join {{ ref('meta_anomaly_run') }} as r on r.run_id = e.run_id
inner join {{ ref('dim_field') }} as f on f.field_id = e.field_id
left join {{ ref('dim_company_group') }} as og on og.group_id = f.operator_group_id
where e.is_anomaly and e.month >= r.flagged_from
