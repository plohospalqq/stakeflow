-- Monthly price inputs, one row per month: input to the scenario model and to TTF in EUR.
-- Daily series are averaged within the month; *_days counts the observations behind each average.
with brent as (
    select date_trunc('month', date)::date as month, avg(brent_usd_bbl) as brent_usd_bbl,
           count(*) as brent_days
    from {{ ref('stg_market__brent_daily') }}
    group by 1
),

fx as (
    select date_trunc('month', date)::date as month, avg(eurusd) as eurusd, avg(usdnok) as usdnok,
           count(*) as fx_days
    from {{ ref('stg_market__fx_daily') }}
    where eurusd is not null and eurnok is not null
    group by 1
),

world_bank as (
    select
        month,
        -- Before April 2015 the World Bank series is not TTF (border prices); leave it out
        case when month >= date '2015-04-01' then ttf_usd_mmbtu end as ttf_usd_mmbtu,
        brent_usd_bbl as wb_brent_usd_bbl
    from {{ ref('stg_market__pink_sheet_monthly') }}
),

months as (
    select month from brent
    union
    select month from fx
    union
    select month from world_bank
)

select
    m.month,
    b.brent_usd_bbl,
    b.brent_days,
    w.ttf_usd_mmbtu,
    {{ usd_mmbtu_to_eur_mwh('w.ttf_usd_mmbtu', 'f.eurusd') }} as ttf_eur_mwh,
    f.eurusd,
    f.usdnok,
    f.fx_days,
    w.wb_brent_usd_bbl
from months as m
left join brent as b on b.month = m.month
left join fx as f on f.month = m.month
left join world_bank as w on w.month = m.month
