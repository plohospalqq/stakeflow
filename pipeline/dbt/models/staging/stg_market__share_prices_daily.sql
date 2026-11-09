-- Daily closes from user-supplied CSVs (local only). Euronext exports are adjusted for
-- corporate actions, so returns computed from them include dividends.
select
    series as ticker,
    date,
    value as close,
    unit as currency,
    (a->>'volume')::bigint as volume,
    loaded_at
from {{ latest_market_values('market_share_prices') }} as v
