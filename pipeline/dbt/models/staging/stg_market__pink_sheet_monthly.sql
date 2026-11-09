-- World Bank monthly averages in USD. "Natural gas, Europe" is the Dutch TTF from April 2015
-- (earlier months mix border prices; the scenario model only uses TTF months).
select
    date as month,
    max(value) filter (where series = 'Natural gas, Europe') as ttf_usd_mmbtu,
    max(unit) filter (where series = 'Natural gas, Europe') as ttf_unit,
    max(value) filter (where series = 'Crude oil, Brent') as brent_usd_bbl,
    max(unit) filter (where series = 'Crude oil, Brent') as brent_unit
from {{ latest_market_values('market_worldbank_pink_sheet') }} as v
group by date
