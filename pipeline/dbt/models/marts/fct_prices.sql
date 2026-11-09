-- Every price series at its native frequency (what /prices serves). One row per series and date;
-- monthly series are dated on the first of the month. Units, source and licence: price_series seed.
with points as (
    select 'brent' as series_id, date, brent_usd_bbl as value
    from {{ ref('stg_market__brent_daily') }}

    union all

    select 'eurusd', date, eurusd
    from {{ ref('stg_market__fx_daily') }}
    where eurusd is not null

    union all

    select 'usdnok', date, usdnok
    from {{ ref('stg_market__fx_daily') }}
    where usdnok is not null

    union all

    select 'ttf', month, ttf_eur_mwh
    from {{ ref('fct_prices_monthly') }}
    where ttf_eur_mwh is not null
)

select p.series_id, p.date, p.value, s.unit, s.frequency, s.source
from points as p
inner join {{ ref('price_series') }} as s on s.series_id = p.series_id
