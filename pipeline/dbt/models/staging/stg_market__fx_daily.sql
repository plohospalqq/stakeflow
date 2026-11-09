-- ECB reference rates, one row per TARGET business day.
-- USD/NOK is not published by the ECB; it is our cross rate EUR/NOK ÷ EUR/USD.
with rates as (
    select
        date,
        max(value) filter (where series = 'EXR.D.USD.EUR.SP00.A') as eurusd,
        max(value) filter (where series = 'EXR.D.NOK.EUR.SP00.A') as eurnok
    from {{ latest_market_values('market_ecb_fx') }} as v
    group by date
)

select date, eurusd, eurnok, eurnok / eurusd as usdnok
from rates
