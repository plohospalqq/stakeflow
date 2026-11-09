-- The latest scenario model per focus company: coefficients with standard errors, covariance,
-- fit and backtest summary. status = insufficient_data explains itself in status_note.
with latest as (
    select run_id from {{ source('ml', 'share_price_models') }} order by run_at desc limit 1
)

select
    m.group_id,
    m.ticker,
    m.run_id,
    m.run_at,
    m.model_version,
    m.status,
    m.status_note,
    m.window_start,
    m.window_end,
    m.n_obs,
    m.coefficients,
    m.covariance,
    m.r2,
    m.adj_r2,
    m.resid_std,
    m.excluded_months,
    m.backtest_quarters,
    m.backtest_r2_in_sample,
    m.backtest_r2_out_of_sample,
    m.backtest_band_coverage
from {{ source('ml', 'share_price_models') }} as m
inner join latest as l on l.run_id = m.run_id
