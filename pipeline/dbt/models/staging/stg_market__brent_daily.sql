-- Brent spot (EIA series RBRTE), USD per barrel, one row per trading day
select date, value as brent_usd_bbl, unit, loaded_at
from {{ latest_market_values('market_eia_brent') }} as v
where series = 'RBRTE'
