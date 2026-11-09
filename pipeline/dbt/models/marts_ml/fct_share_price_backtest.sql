-- Quarterly log returns of the latest run: actual, explained in sample, and explained out of
-- sample (fit on earlier months only) with its 80% band. Uses realised drivers: it measures
-- explanatory power, not the ability to predict.
select
    b.group_id,
    b.quarter_start,
    b.actual_return,
    b.fitted_return,
    b.oos_return,
    b.oos_lo,
    b.oos_hi,
    b.train_months
from {{ source('ml', 'share_price_backtest') }} as b
inner join {{ ref('fct_share_price_models') }} as m
    on m.run_id = b.run_id and m.group_id = b.group_id
