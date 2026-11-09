-- Units check across two independent sources: EIA's daily Brent averaged per month must agree
-- with the World Bank's monthly Brent. A unit mix-up (per m³, cents, a different series) is off
-- by far more than 25%; a systematic bias shows up in the median. Real months differ by about
-- 1% on average; the worst is April 2020 (−21%), when physical spot and dated Brent split.
with diffs as (
    select month, abs(brent_usd_bbl / wb_brent_usd_bbl - 1) as rel_diff
    from {{ ref('fct_prices_monthly') }}
    where brent_days >= 15 and wb_brent_usd_bbl > 0
)

select 'month off by more than 25%' as problem, month, rel_diff
from diffs
where rel_diff > 0.25

union all

select 'median difference above 2%', null, percentile_cont(0.5) within group (order by rel_diff)
from diffs
having percentile_cont(0.5) within group (order by rel_diff) > 0.02
