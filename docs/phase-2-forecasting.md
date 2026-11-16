# Phase 2: field forecasts, quarterly nowcasts, the prediction log

Status: built 2026-11-09, revised 2026-11-16 (model `arps-1.1.0`, nowcast `nowcast-1.1.0`:
calibrated ranges, fields in their first year held at their best recent month, the start-up
watchlist). Scope follows
[`nowcast-feasibility.md`](nowcast-feasibility.md): companies publish quarterly production
12-14 days after quarter end, Sodir field data lands 40-69 days after month end, so a quarterly
prediction is **frozen at quarter end and scored against the company's trading update**.

## What runs

```
raw (Sodir) ─► dbt marts ─► forecast run (Python, ml.*) ─► dbt ml models (marts.fct_*) ─► API
                                   │
                                   └─► predictions/<YYYY>Q<n>/<company>.json (quarter end, CI)
```

| Step | Command | Writes |
|---|---|---|
| Marts | `dbt build --exclude tag:ml` | `marts.*` (as before) |
| Forecast run | `stakeflow-forecast [--quarter 2026Q4] [--backfill-from 2023Q1 \| --no-backfill]` | `ml.model_runs`, `ml.field_forecast`, `ml.field_model_card`, `ml.predictions` |
| API-facing models | `dbt build --select tag:ml` | `marts.fct_field_forecast`, `fct_field_model_card`, `fct_prediction_scores`, `fct_prediction_accuracy` |
| Public proof | `stakeflow-export-predictions --quarter 2026Q4 --out ../predictions` | canonical JSON per company |

In Dagster all of it is one job (`sodir_refresh`): the forecast run is the multi-asset
`ml/*` between the two dbt selections. A run takes about 4 minutes on the full Sodir history:
every run replays the quarters since 2020 to learn how wide the range must be (see the
nowcast below), and the backtests it stores come out of that same replay.
`--calibrate-from 2025Q1` shortens the replay where the numbers do not matter (CI).

All `ml` tables are **append-only, enforced by the database**: a trigger rejects UPDATE,
DELETE and TRUNCATE. `ml.field_forecast_latest` and `ml.field_model_card_latest` are views on
the newest run.

## Field model (`stakeflow_pipeline/forecast/field_model.py`)

Every field that produced in the last 24 months gets a forecast, because the company nowcast
needs all of them; only fields in an established decline get an Arps curve.

| Status | When | Forecast |
|---|---|---|
| `arps` | ≥ 12 months since the plateau ended | hyperbolic Arps from the plateau end |
| `plateau` | still within 10% of its 10-year peak | flat at the last 3 months |
| `ramp_up` | not declining yet, last 6 months > 1.1 × the 6 before | flat at the last 3 months |
| `too_short` | under 12 months of production | flat at the best of the last 3 months |
| `shut_down` | nothing produced in the last 3 months | zero, no points |

- **Decline start:** smoothed rate (5-month rolling median, so a single turnaround month
  vanishes), the highest point of the last 10 years, then the last month still within 10% of
  it. Ten years rather than the whole life, so a redevelopment (Sverdrup phase 2) restarts the
  decline instead of being fitted as noise on an old curve. 60- and 36-month look-backs were
  tested and were worse.
- **Arps fit** (`arps.py`): `q(t) = qi / (1 + b·Di·t)^(1/b)`, b in [0, 1.5] (exponential at
  b = 0, computed with `log1p` and the exact limit), fitted on log(rate) with a soft-L1 loss so
  outage months do not drag the curve down; three starting values of b, best one kept.
- **Seasonal factors:** one multiplicative factor per calendar month from the last 5 years
  (summer turnarounds, winter gas offtake), removed before fitting and re-applied after.
- **Level anchor:** the curve gives the shape, the median of the last 6 months the level.
- **80% range:** residual block bootstrap with refit (200 draws, 6-month blocks) plus a random
  level drift sized from the field's own history. Why bootstrap and not the Jacobian's
  parameter covariance: b and Di trade off strongly and often sit on a bound, where a Gaussian
  proposes negative b; refitting respects bounds and non-linearity, blocks keep the
  autocorrelation of monthly residuals. Seeded per field and data cut-off: same inputs, same
  numbers. p10 is the low case (statistical convention, not the reserves one).
- **Fields in their first year** are held at the best of their last 3 months, not the mean: a
  field that young is still ramping up, and the average of a climb is below where it stands.
  On the 78 NCS fields that started since 2000, forecasting the quarter ahead at months 1-11 of
  their life, the mean was 21% too low (volume-weighted error 31%), the best month 6% too low
  (27%). A typical ramp-up profile learned from the other start-ups was tried and did no
  better (27%). Their month-to-month noise is measured around a 3-month rolling median: around
  the plain median the "noise" was the ramp-up itself, and replaying it sent the forecast back
  down the ramp.
- **Backtest:** refit without the last 12 months, compare with what happened, next to the
  naive baseline (last 3 months held flat). Stored per field (model card) and overall
  (`ml.model_runs`).

What was tried and measured (five 12-month holdouts ending Dec 2024 to Aug 2026, ~95 fields
each; WAPE = volume-weighted absolute error):

| Variant | WAPE months 1-3 | WAPE months 1-12 | 80% range hit rate |
|---|---:|---:|---:|
| Naive: last 3 months flat | 12.9% | 15.5% | - |
| Arps, 10-year look-back, anchored | 13.2% | 15.7% | 56% |
| + seasonal factors | 12.1% | 15.1% | 54% |
| + estimator bootstrap and level drift (shipped) | 12.7% | 15.6% | 68-70% |

On synthetic fields that follow the model's assumptions the shipped range covers ~79% of
held-out months (test: `tests/test_field_model.py`). On real fields it covers ~70%: new wells,
tie-backs and restarts are not in any decline curve. Arps beats the naive baseline in the
months that matter for a quarterly nowcast (1-3) and ties it over 12 months; its bias is
negative (about -2%), because NCS fields decline more slowly than their own curves while
operators keep drilling.

## Quarterly nowcast (`nowcast.py`)

For a company group and quarter:

```
volume  = Σ observed months (Sodir, day-weighted shares, from the marts)
        + Σ forecast months Σ fields  field draw × group share that month
kboe/d  = volume × 6.2898 / days in quarter / 1000      (same as fct_quarterly_reconciliation)
```

- Shares for forecast months are day-weighted from the ownership rows **known at the freeze
  date**: a row that started later is ignored, a row that ended later is treated as open.
- Range as simulated: field draws summed draw by draw, i.e. **field errors assumed
  independent**. They are not (a gas plant outage, a start-up no decline curve can see), so
  this range is too narrow: on the 45 backtest quarters it held the published figure 73% of
  the time (62% before the first-year change above). Perfectly correlated draws would give a
  range almost four times as wide that holds nearly everything.
- **Calibrated range** (`calibration.py`): instead of tuning a correlation on a few dozen
  points, the simulated range is widened by what earlier quarters showed. Every quarter since
  2020Q1 is replayed as a backtest and scored in half-widths of its own range (log scale: 1.0
  = the actual landed on the bound). The factor is the 80th percentile of the scores of the
  quarters whose actuals were already in the data at the freeze date, never below 1, and both
  sides are scaled by it around an unchanged centre: `bound' = centre x (bound / centre)^factor`.
  A quarter with two months observed stays narrow, one that is all forecast gets wide, by the
  same factor. No look-ahead: a 2023Q1 backtest learns from 2020Q1-2022Q4 only (36 scores,
  factor 1.47); today's live quarter from 78 scores (factor 1.20: the errors of 2020-2022 were
  larger). The factor and the number of scores are in every prediction's `inputs`, so the
  committed file says how its range was made. Fewer than 12 scores: the range stays as
  simulated.
- Not done, on purpose: moving the centre by the past median error. The model is about 3% low
  on average, but shifting by an expanding-window median left the error unchanged (4.6% against
  4.7% in the test replay), so the centre stays what the fields add up to.

## Prediction log (`ml.predictions`)

| Column | Meaning |
|---|---|
| `id` | uuid |
| `group_id`, `quarter_start` | which company and quarter |
| `predicted_at` | when it was computed (UTC, to the second, real clock: cannot be backdated) |
| `as_of` | the freeze date: run date for `live`, quarter end for `backtest` |
| `data_through` | newest Sodir month the model used |
| `months_in_data` | quarter months already in Sodir data (0-3) |
| `value_kboe_d`, `lo`, `hi` | prediction and 80% range, kboe/d |
| `model_version`, `kind` | `nowcast-1.0.0`; `live` or `backtest` |
| `input_hash` | sha256 of the canonical JSON in `inputs` |
| `prediction_hash` | sha256 of the canonical JSON of the row without `prediction_hash` and `inputs` |
| `inputs` | model versions, quarter, `data_through`, raw ingestion run ids, sha256 of the exact numbers used, `range_calibration` (factor, number of scored quarters behind it) |

Canonical JSON = sorted keys, no whitespace, UTF-8, values rounded before hashing. A revision
is a new row, and so is the replay of a past quarter by a new model version; scoring uses the
newest row per (company, quarter, kind). Older rows stay in the log (`/predictions?latest=false`).

### Live and backtest

- **live:** made with the data we had at that moment. Only for a quarter that has not ended
  (7 days' grace for a late scheduled run); `predicted_at` always comes from the real clock.
- **backtest:** replayed from today's data truncated to what would have been published at the
  quarter end. Months count as published only if they ended at least **69 days** before the
  quarter end (the longest field-level lag we measured), so backtests never see more than a
  real freeze could have.

**Limitation: one data vintage.** We keep raw snapshots only from November 2026 on, so
backtests use today's version of history. Sodir revises old months, and ownership records can
be corrected retroactively; both leak into backtests. They are labelled `backtest`, scored
separately and never mixed with `live` rows. As snapshots accumulate, `inputs.ingestion_run_ids`
lets later backtests run on the vintage that really existed.

### Scoring (`fct_prediction_scores`, `fct_prediction_accuracy`)

- **vs reported:** the company's trading update (`reported_quarterly_production` seed): error %,
  in range, and the naive baseline = the company's reported figure for the previous quarter.
- **vs Sodir-attributed:** once all three months are in Sodir's data. More quarters, and it
  separates forecasting skill from the ~1% equity-vs-entitlement gap between Sodir-attributed
  and reported volumes. Baseline = the previous quarter's attributed figure (known at the
  freeze date).

## Results (run of 2026-11-16, Sodir data through Aug 2026)

**Fields.** 103 fields produced in the last two years: 78 on an Arps curve, 9 on plateau,
3 ramping up and 6 too young (held flat), 7 shut down. 12-month backtest (Sep 2025 - Aug 2026
held out, 91 fields):

| | Model | Naive (last 3 months flat) |
|---|---:|---:|
| Volume-weighted error (WAPE) | **15.9%** | 17.7% |
| Bias (volume-weighted) | -4.0% | -3.2% |
| Median field MAPE | 31.4% | 29.3% |
| Fields where it wins | 45 of 91 | |
| Months inside the 80% range | 67.9% | |

The mean field MAPE (71% for both) is not a useful headline: tiny fields such as Tune, where a
few hundred Sm³ either way is a 1,000% error, dominate it.

**Quarters, backtest** (frozen at each quarter end 2023Q1 - 2026Q3, data through the previous
quarter, 45 predictions; the reported figures are the 45 sourced quarters in the seed):

| Scored against | n | Model MAPE | Baseline MAPE | Bias | In 80% range |
|---|---:|---:|---:|---:|---:|
| Company-reported, all | 45 | **4.60%** | 5.44% | -3.1% | 82% (37 of 45) |
| Aker BP | 15 | 3.55% | 3.50% | -1.6% | 87% |
| Equinor (E&P Norway) | 15 | **3.13%** | 4.67% | -1.6% | 93% |
| Vår Energi | 15 | **7.13%** | 8.13% | -6.3% | 67% |
| Sodir-attributed, all | 42 | **3.94%** | 5.23% | -2.0% | 90% (38 of 42) |
| Aker BP | 14 | 3.69% | 3.54% | -1.1% | 100% |
| Equinor (NCS only) | 14 | **3.29%** | 4.69% | -1.9% | 93% |
| Vår Energi | 14 | **4.83%** | 7.44% | -2.9% | 79% |

Baseline = the figure for the quarter before (reported, or attributed), which exists for 14 of
each company's 15 quarters; on those the model's error against the reported figure is 2.78%
(Aker BP), 3.03% (Equinor) and 7.26% (Vår Energi), the numbers in the README.

What the two changes of `nowcast-1.1.0` did, on the same 45 quarters:

| | Error vs reported | In range vs reported | Error vs attributed | In range vs attributed | Range width |
|---|---:|---:|---:|---:|---:|
| `nowcast-1.0.0` | 5.30% | 62% | 4.68% | 67% | 12.5% |
| + first-year fields at their best recent month | 4.60% | 73% | 3.94% | 76% | 12.2% |
| + calibrated range (shipped) | 4.60% | **82%** | 3.94% | **90%** | 17.1% |

The range is a little wide against Sodir-attributed actuals (90%) and close to nominal against
what companies publish (82%): the reported figure differs from the attributed one by about 1%
for reasons the model does not see, which is the test that counts. Aker BP did not gain (its
ranges were already honest and its first-year fields small); Vår Energi gained most and still
misses most: 2025Q3 came out at 293.5 [275.1 - 313.1] against 370 reported (-21%, was -26%),
because the Balder redevelopment started after the data cut-off. No decline model can see
production that has not begun, which is what the start-up watchlist below is for.

**Q3 2026, the latest quarter with trading updates in the seed:**

| | Frozen 30 Sep (data to Jun) | Reported | Error | Naive (Q2 reported) |
|---|---:|---:|---:|---:|
| Aker BP | 383.7 [354.8 - 408.8] | 374.3 | +2.5% | 383.6 (+2.5%) |
| Equinor (E&P Norway) | 1428.1 [1362.4 - 1493.1] | 1421 | +0.5% | 1415 (-0.4%) |
| Vår Energi | 364.2 [337.1 - 388.8] | 369 | -1.3% | 376 (+1.9%) |

Aker BP's Q3 estimate was closer under the old rule (377.2, +0.8%): Symra had just started,
and holding it at its best month overshot this once. The rule is kept for what it does across
78 start-ups, not for one quarter.

**Live, the open quarter (Q4 2026, made 2026-11-16, data through Aug 2026, 0 of 3 months in):**
Aker BP 373.6 [340.8 - 406.9], Vår Energi 360.6 [334.2 - 386.9], Equinor (NCS only)
1466.5 [1386.1 - 1534.9] kboe/d, ranges 1.20 times as wide as simulated. The quarter-end
workflow freezes the official one on 31 Dec.

## Start-up watchlist (`marts.fct_field_startups`, `GET /startups`)

The fields behind the largest misses are known in advance, just not to a decline curve. Sodir's
field table says which fields are approved for production, and its status history says since
when; production says which ones have under a year behind them.

| Stage | Rule | In the nowcast |
|---|---|---|
| `approved` | status "Approved for production" and nothing produced in the last 12 months | not at all, until it produces |
| `ramping` | under 12 months of production (field model status `too_short`) | held at its best recent month |

"Nothing produced in the last 12 months" rather than "never produced", so old fields being
redeveloped count too (Vest Ekofisk, Albuskjell and Tommeliten Gamma, approved in May 2026).
On data through Aug 2026 the list has 11 approved fields (Fenris, and Hugin, Munin and Fulla
of the Yggdrasil area, all approved in June 2023, Aker BP holding 48-78% of each; Irpa;
Berling; Bestla) and 6 ramping ones (Verdande, Symra, Eirin, Alve Nord, Idun Nord, Ørn). The
API returns each with its current owners, and the company page lists the ones a company holds
next to its nowcast.

It is a watchlist, not a forecast: Sodir's tables carry no expected start date or volume
(those are in press releases and PDO documents). A redevelopment that restarts an existing,
producing field (Balder X on Balder) has no separate field in Sodir and cannot be listed at
all.

## Public proof

`.github/workflows/freeze-predictions.yml` runs at 23:00 Oslo time on the last day of each
quarter (and on demand): PostGIS service, live Sodir ingest, dbt, `stakeflow-forecast --quarter
<Q> --no-backfill`, dbt tests on the ml models, export, commit `predictions/<YYYY>Q<n>/*.json`.
The commit time is the public timestamp; the trading update comes 12-14 days later. A
re-run never silently replaces a committed prediction (`--force` / workflow input `force`).

Verify a file:

```bash
python -c "import hashlib, json, sys; d = json.load(open(sys.argv[1])); \
inputs = d.pop('inputs'); h = d.pop('prediction_hash'); \
c = lambda o: json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False); \
print(hashlib.sha256(c(inputs).encode()).hexdigest() == d['input_hash'], \
hashlib.sha256(c(d).encode()).hexdigest() == h)" predictions/2026Q4/aker-bp.json
```

## API

| Endpoint | Returns |
|---|---|
| `GET /fields/{id}/forecast` | `{fieldId, points[{month, p10, p50, p90, isActual}], model{…}, events[]}`; first point = last actual month; 404 if the field has no model card |
| `GET /nowcasts` | newest live prediction per focus company: value, lo, hi (kboe/d), madeAt, dataThrough, monthsInData, hash, inputHash, status, expectedReportOn, reportKind |
| `GET /predictions?company=&kind=&latest=` | the log with actual, errorPct, inRange, baseline, attributed actual and errors, hashes, kind |
| `GET /startups?company=` | the watchlist: `{fieldId, fieldName, stage, approvedOn, firstProductionMonth, monthsProducing, latestBoePerDay, factpageUrl, owners[{companyId, companyName, sharePct}]}`, approved fields first |

All read `marts` only, are read-only like the rest of the API, and answer 503 (not 500) before
the first forecast run.

## Known limitations and next steps

- A field that is not producing yet is still not in any estimate: the watchlist names it but
  has no date or volume to forecast with. A hand-kept table of sanctioned start-ups (expected
  first oil, plateau rate, source link), like the reported-quarters seed, would let the nowcast
  include them and would fix the biggest remaining misses.
- Redevelopments of producing fields (Balder X) are invisible even to the watchlist.
- The range factor is one number for all three companies. Vår Energi's range is still short
  (67% against reported) and Equinor's long (93%); a factor per company needs more quarters
  than there are.
- The calibration replay makes every run about four minutes longer; the scores could be stored
  once per model version instead of recomputed.
- One data vintage for backtests (see above).
