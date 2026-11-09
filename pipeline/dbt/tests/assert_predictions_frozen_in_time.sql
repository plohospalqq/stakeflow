-- No look-ahead: at the freeze date the quarter's last month can never be in Sodir's data yet,
-- and a live prediction must be made by quarter end (7 days' grace for a delayed scheduled run)
{{ config(tags=['ml']) }}

select prediction_id, kind, quarter_start, as_of, data_through
from {{ ref('fct_prediction_scores') }}
where data_through >= date_trunc('month', quarter_end)
   or (kind = 'live' and as_of > quarter_end + 7)
   or (kind = 'backtest' and as_of <> quarter_end)
