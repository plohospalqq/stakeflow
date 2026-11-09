-- Every range must contain its own central value: p10 ≤ p50 ≤ p90, lo ≤ value ≤ hi
{{ config(tags=['ml']) }}

select 'field' as kind, field_id::text as id, month::text as period
from {{ ref('fct_field_forecast') }}
where not (p10_oe_sm3 <= p50_oe_sm3 and p50_oe_sm3 <= p90_oe_sm3) or p10_oe_sm3 < 0

union all

select 'prediction', prediction_id::text, quarter_start::text
from {{ ref('fct_prediction_scores') }}
where not (lo <= value_kboe_d and value_kboe_d <= hi) or lo < 0
