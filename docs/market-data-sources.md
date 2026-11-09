# Market data sources and licences

Checked 2026-11-09 by fetching each source and reading its terms. This is what Stakeflow may
and may not do with prices in a public portfolio app. It is a reading of public terms, not
legal advice; re-check before a public deployment changes how data is shown.

## Summary

| Data | Source | Frequency | Licence verdict | What Stakeflow does |
|---|---|---|---|---|
| Brent crude | [EIA API v2](https://www.eia.gov/opendata/), series RBRTE | daily (EIA releases weekly) | **Public domain**, cite EIA | Downloads automatically, stores, displays |
| EUR/USD, EUR/NOK | [ECB Data Portal](https://data.ecb.europa.eu/data/datasets/EXR) | daily (TARGET days) | **Free reuse with attribution**, unmodified | Downloads automatically, displays; USD/NOK is our own cross rate, labelled as such |
| European gas (TTF) | [World Bank Pink Sheet](https://www.worldbank.org/en/research/commodity-markets), "Natural gas, Europe" | monthly | **CC BY 4.0** | Downloads automatically, converts USD/MMBtu to EUR/MWh (stated), displays |
| Daily TTF | none found | – | No free source with display rights | Not used |
| Brent/TTF forwards | none found | – | No free source with display rights | Not used: no `/prices/forward`; `/prices/latest` serves spot |
| AKRBP, VAR, EQNR | [Euronext](https://live.euronext.com/) export, downloaded **by the user** | daily | **Personal, non-commercial use only; no robots, no redistribution** | User-supplied CSV, local database only, never committed, never in a public build |
| Market index (OSEBX) | Euronext | daily | Same restrictions as the shares | Not used: the scenario model has no market factor |

## Brent: U.S. Energy Information Administration (EIA)

- **Endpoint:** `https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE`
  (Europe Brent Spot Price FOB, USD per barrel). The same series as
  [RBRTED](https://www.eia.gov/dnav/pet/hist/RBRTED.htm), released weekly (e.g. released
  2026-11-04, next 2026-11-12).
- **Terms** ([Copyrights and reuse](https://www.eia.gov/about/copyrights_reuse.php)):
  "U.S. government publications are in the public domain and are not subject to copyright
  protection." "You may use and/or distribute any of our data, files, databases, reports,
  graphs, charts, and other information products." Attribution: "you should use an
  acknowledgment, which includes the publication date", e.g. "Source: U.S. Energy Information
  Administration (Oct 2008)". Exceptions are third-party material, photos and the EIA logo; the
  spot price pages name no third-party provider, and FRED tags this series "Public Domain:
  Citation Requested".
- **May:** download automatically, store, display, redistribute, with the EIA credit.
- **May not:** use the EIA logo; imply EIA endorses Stakeflow.
- **Key:** the API wants a key. `EIA_API_KEY` (free: <https://www.eia.gov/opendata/register.php>)
  is read from the environment and sent as an `X-Api-Key` header, never in a URL. Without it
  the shared api.data.gov `DEMO_KEY` is used, which is rate-limited (about 30 requests an hour)
  but enough for one daily download.
- **Not used: FRED** (DCOILBRENTEU is the same EIA series). FRED's
  [terms](https://fred.stlouisfed.org/legal/) prohibit using "scripts, spiders, scrapers, bots"
  outside the keyed API and redistributing third parties' content, so going to EIA directly is
  simpler and cleaner.

## EUR/USD and EUR/NOK: European Central Bank

- **Endpoint:** `https://data-api.ecb.europa.eu/service/data/EXR/D.USD+NOK.EUR.SP00.A?format=csvdata`
  (euro foreign exchange reference rates, 14:15 CET concertation).
- **Terms** ([ECB statistics reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html)):
  "All publicly available ESCB statistics may be reused free of charge on the condition that
  the source is quoted" and "that the statistics (including metadata) are not modified."
  Attribution example: "Source: ECB statistics." The
  [reference rates page](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
  adds: "The reference rates are published for information purposes only. Using the rates for
  transaction purposes is strongly discouraged."
- **May:** download, store, display with "Source: ECB statistics".
- **May not:** present a changed value as an ECB value. USD/NOK is not published by the ECB; it
  is our cross rate (EUR/NOK ÷ EUR/USD) and the `price_series` seed and the API label it
  "derived by Stakeflow". Monthly averages are likewise ours.
- **Considered: Norges Bank** (`https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP`,
  publishes USD/NOK directly and works without a key). Its
  [open data page](https://www.norges-bank.no/en/topics/Statistics/open-data/) states no
  licence text we could quote, so the ECB, whose terms are explicit, is used.

## TTF: World Bank Commodity Price Data (the Pink Sheet)

- **Endpoint:** the monthly workbook `CMO-Historical-Data-Monthly.xlsx`, sheet "Monthly
  Prices", column "Natural gas, Europe" (USD/MMBtu) and "Crude oil, Brent" (USD/bbl, used only
  as a units cross-check against EIA). The file URL changes with every release, so it is read
  from the [Commodity Markets page](https://www.worldbank.org/en/research/commodity-markets)
  each time. Updated on the second business day of each month.
- **What the series is:** the workbook's notes: "Natural Gas (Europe), from April 2015,
  Netherlands Title Transfer Facility (TTF); April 2010 to March 2015, average import border
  price and a spot price component". Stakeflow only uses it as TTF from April 2015.
- **Licence:** the World Bank Data Catalog entry
  [Commodity Prices - History and Projections](https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections)
  (which links to the Commodity Markets page) says "License: Creative Commons Attribution 4.0".
  The catalogue's [licence page](https://datacatalog.worldbank.org/public-licenses): CC BY 4.0
  "allows users to copy, modify and distribute data in any format for any purpose, including
  commercial use"; users must "give appropriate credit" and "indicate if they have made any
  changes".
- **May:** download, store, display, convert, redistribute, with credit.
- **Must:** credit the World Bank and say what we changed. We convert USD/MMBtu to EUR/MWh
  (1 MMBtu = 0.29307107 MWh, divided by the month's average ECB EUR/USD); the attribution in
  the `price_series` seed says so.
- **Daily TTF:** no free source with display rights. ICE Endex settlement prices and EEX
  indices are licensed products; commercial price APIs with free tiers (e.g. OilPriceAPI,
  Commodities-API) restrict use to their own terms and were not adopted. Monthly is enough for
  the scenario model, which is monthly anyway.

## Share prices: Aker BP (AKRBP), Vår Energi (VAR), Equinor (EQNR)

No free source we found allows an app to download Oslo Børs prices automatically **and** show
them publicly.

- **Euronext** (live.euronext.com, the exchange itself;
  [terms of use](https://www.euronext.com/en/terms-use)): "You may print or download a single,
  unaltered, permanent copy" "for your personal, non-commercial use only"; you "will not sell,
  license, rent, modify, ... distribute, disseminate, ... publicly display, ... publish ... any
  Content"; use of "spiders, robots ... agents, tools or other devices or mechanisms to
  navigate, search" and "systematic retrieval to create collections, compilations, databases or
  directories" are "strictly prohibited". Redistribution of market data needs a
  [market data licence](https://www.euronext.com/en/data/market-data/market-data-agreements)
  (EMDA). The free "Historical Data" export covers about the last two years only.
- **Stooq:** downloads now sit behind a JavaScript proof-of-work challenge; automated access is
  plainly not intended, and no terms grant display rights.
- **Alpha Vantage:** free key, but the [terms](https://www.alphavantage.co/terms_of_service/)
  grant use "for personal, non-commercial use" only, and we could not confirm Oslo Børs
  coverage (the demo key only answers the documentation's own examples).
- **Yahoo Finance and similar:** terms forbid automated scraping and redistribution.

**Decision:** Stakeflow never downloads share prices. The user exports the CSV themselves
(Euronext allows that for personal use) and loads it into **their own local database**:

```bash
# save the Euronext "Historical Data" CSV as data/share_prices/EQNR.csv (data/ is gitignored)
cd pipeline && uv run stakeflow-import-share-prices ../data/share_prices
```

The Dagster asset `raw/market_share_prices` picks up the same folder (`SHARE_PRICES_DIR`) on
each market run and does nothing when it is empty. The importer accepts the Euronext export
(`;`-separated, ISIN checked against `dbt/seeds/share_listings.csv`, so a file saved under the
wrong ticker is rejected) and a plain `date,close[,volume]` CSV from any source the user is
licensed for (a broker export, for example, with a longer history).

Rules that follow from the terms:

- Share price files and data are **never committed** (`data/` and `*.csv` are ignored; the only
  CSV fixture is a made-up format sample), never part of CI, never baked into a static build,
  screenshot or README.
- The API serves them only from the database of the installation where they were imported.
  `/companies/{id}/share-price` returns an empty series elsewhere, and
  `/companies/{id}/scenario` answers 503 with the reason.
- A public deployment must not import them without a licence from Euronext.

Consequence for the scenario model: with the free two-year export it is fitted on about 21
monthly returns, and it says so in every response.

## Market index

OSEBX (Oslo Børs Benchmark Index) is Euronext data with the same restrictions. It is also
circular for Equinor, which is roughly a fifth of the index. The scenario model therefore has no
market factor; the documentation and the API's method text say so.

## Attribution to show with prices

- Brent: "Source: U.S. Energy Information Administration (EIA), Europe Brent Spot Price FOB,
  release of <date>."
- FX: "Source: ECB statistics. USD/NOK computed by Stakeflow from ECB EUR/NOK and EUR/USD."
- TTF: "Source: World Bank Commodity Price Data (The Pink Sheet), CC BY 4.0. Converted by
  Stakeflow from USD/MMBtu to EUR/MWh."
- Share prices: "Imported locally from the operator's own Euronext download. Not
  redistributed."

The `price_series` seed carries these strings; `/prices` returns them with every series.
