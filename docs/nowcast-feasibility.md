# Nowcast feasibility: Sodir publication lag vs company reporting

Status: research done 2026-11-08. Decides the scope of the Phase 2 nowcast.

## Question

Can Sodir's public data predict Aker BP's and Vår Energi's quarterly production and revenue
**before** the companies publish them?

## Facts

### When Sodir data appears

| What | When | Source |
|---|---|---|
| Licensees report saleable monthly volumes to Diskos | by the **20th of M+1** | Sodir Green Book (Jan 2024) |
| Sodir press release, preliminary **NCS totals only** (no field split) | ~20th–23rd of M+1 (Sep 2026 → 20 Oct; Aug 2025 → 23 Sep) | Sodir news |
| **Field-level** monthly data in DataService (`profiles`) | **40–69 days after month end** | Measured, see below |

Field-level lag, measured from our own ingestion on 2026-11-08: August 2026 is present for all
106 producing fields, September 2026 is absent. So the lag is longer than 39 days (September)
and at most 69 days (August). Sodir does not document the refresh date, so we will measure it
precisely from snapshots (see "Next steps").

### When the companies publish (Q3 2026 as the example, quarter end = T = 30 Sep)

| Day | Event | What it discloses |
|---|---|---|
| T+12 (12 Oct) | Vår Energi trading update | production 369 kboepd by product, sales volumes, realised prices |
| T+14 (14 Oct) | Aker BP trading update | equity production 374.3 mboepd, over/underlift, volumes sold, realised prices |
| T+20 (20 Oct) | Sodir preliminary NCS totals for September | NCS total only |
| T+21 (21 Oct) | Vår Energi Q3 report | full financials |
| T+29 (29 Oct) | Aker BP Q3 report | full financials |
| ~T+40–69 | Sodir field-level data for September | first time the full quarter is attributable |

### Correction (2026-11-09, from 45 sourced quarters)

- Aker BP trading updates appear **3–16 days** after quarter end (not always ~14).
- Vår Energi trading updates appear ~10–13 days after Q1–Q3, but **~4 weeks** after Q4.
- Equinor publishes no trading update; its E&P Norway figure first appears in the quarterly
  report, ~4–5 weeks after quarter end.
- Vår Energi's figures include fuel gas that is not sold, so they run above Sodir's saleable
  volumes (−3.8% average gap); Q1 2024 is a structural break (Neptune counted from 1 January).

The verdict below still holds: Sodir's field data for the last month of a quarter always arrives
after the company's first publication.

## Verdict

**"Beat the companies with Sodir data" is not feasible.**

1. Both companies publish production at T+12/T+14. At that point Sodir field-level data covers
   at best the first month of the quarter (July), sometimes not even that.
2. The trading updates also give sales volumes and realised prices per product, so revenue is
   roughly `volumes sold × realised price` two weeks before the full report. There is little
   left to "nowcast" between the trading update and the report.
3. The full quarter becomes attributable from Sodir data only ~T+40 to T+69, after both reports.

**A reframed version is feasible and still worth building:**

| Output | Made at | Scored against | Why it is useful |
|---|---|---|---|
| Quarterly production forecast | quarter end (T) or earlier, e.g. T−30 | trading update (T+12/14) | Real forecasting with partial data (M1 from Sodir, M2 from NCS totals, M3 forecast). Shows point-in-time ML without look-ahead bias |
| Revenue estimate | same | reported revenue (T+21/29) | Tests the price model: realised prices differ from Brent/TTF (Vår crude +6 USD/bbl to Dated Brent, gas ~18 USD/boe below spot, part sold on fixed contracts) |
| Reconciliation: Sodir-attributed vs reported production | after field data lands | trading update | Data-quality story: how close public data gets, and why (equity vs entitlement, overlift/underlift, boe conversion) |

Things the revenue model must respect:

- Revenue follows **volumes sold**, not volumes produced. Aker BP Q3 2026: produced 374.3,
  sold 395.7 mboepd because of 21.4 mboepd overlift.
- Gas is partly sold on year-ahead / fixed-price contracts, so TTF spot alone overestimates
  sensitivity.

Risk to watch: Vår Energi's proposed combination with BlueNord (Danish production). If it
closes, Vår is no longer NCS-only and needs the same "(NCS only)" treatment as Equinor.

## Next steps (proposed)

- Phase 1, step 2: a daily Dagster sensor asks Sodir for the latest month in `profiles` (one
  cheap statistics query) and triggers ingestion only when a new month appears. The monthly
  schedule stays as a fallback. This measures the publication lag to the day instead of ±30 days.
- Phase 1, step 4: a `fct_publication_lag` model: first snapshot in which each (field, month)
  appeared, minus the month end.
- Phase 2: a small seed of reported quarterly figures (production, volumes sold, realised
  prices) from Aker BP and Vår Energi trading updates, used as ground truth.

## Sources

- Sodir Green Book (monthly production reporting): https://www.npd.no/globalassets/1-sodir/regelverk/veiledninger/green-book.pdf
- Sodir production figures, Aug 2025: https://www.sodir.no/en/whats-new/news/production-figures/2025/production-figures-august-2025
- Sodir preliminary figures, Sep 2026 (via energy-pedia): https://www.energy-pedia.com/news/norway/news-listings-energy-pedia-development-and-production-norway-flagnorway-norway--norwegian-offshore-directorate-announces-production-figures-fo-205743
- Aker BP Q3 2026 trading update: https://www.inderes.dk/en/releases/akrbp-third-quarter-2026-trading-update
- Aker BP reporting dates: https://akerbp.com/en/investor/calendar/
- Vår Energi Q3 2026 trading update: https://www.inderes.dk/en/releases/var-energi-third-quarter-2026-trading-update
