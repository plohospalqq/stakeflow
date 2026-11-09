-- Daily closing prices of the focus companies' shares, for context and the scenario model.
-- Exists only where the user imported CSVs locally (see docs/market-data-sources.md).
select
    l.group_id,
    p.ticker,
    p.date,
    p.close as close_nok,
    p.volume
from {{ ref('stg_market__share_prices_daily') }} as p
inner join {{ ref('share_listings') }} as l on l.ticker = p.ticker
