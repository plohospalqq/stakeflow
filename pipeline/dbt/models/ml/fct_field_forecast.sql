-- Newest forecast run: 36 months per field, monthly Sm³ o.e. p10 is the low case, p90 the high.
select
    f.field_id,
    f.month,
    extract(day from (f.month + interval '1 month' - interval '1 day'))::int as days_in_month,
    f.p10_oe_sm3,
    f.p50_oe_sm3,
    f.p90_oe_sm3,
    f.run_id
from {{ source('ml', 'field_forecast_latest') }} as f
