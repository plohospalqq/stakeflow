# Phase 2: field forecasts, quarterly nowcasts, the prediction log

Status: built 2026-11-09 (model `arps-1.0.0`, nowcast `nowcast-1.0.0`). Scope follows
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
`ml/*` between the two dbt selections. A run takes about 3 minutes with the backfill of past
quarters and ~25 seconds without (backtests already in the table are never recomputed).

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
| `too_short` | under 12 months of production | flat at the last 3 months |
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
- Range: field draws summed draw by draw, i.e. **field errors assumed independent**. Measured
  on 42 backtest quarters against Sodir-attributed actuals: the independent range (~13% wide)
  held the actual 64% of the time; perfectly correlated draws give a ~40% range that held it
  98% of the time. Real errors are partly shared (a gas plant outage, a start-up), so the truth
  is in between. We publish the independent range and its measured hit rate instead of tuning
  a correlation on 42 points.

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
| `inputs` | model versions, quarter, `data_through`, raw ingestion run ids, sha256 of the exact numbers used |

Canonical JSON = sorted keys, no whitespace, UTF-8, values rounded before hashing. A revision
is a new row; scoring uses the newest row per (company, quarter, kind, model version).

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

## Results (run of 2026-11-09, Sodir data through Aug 2026)

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
quarter, 45 predictions):

| Scored against | n | Model MAPE | Baseline MAPE | Bias | In 80% range |
|---|---:|---:|---:|---:|---:|
| Sodir-attributed, all | 42 | **4.68%** | 5.23% | -3.0% | 67% |
| Aker BP | 14 | 3.62% | 3.54% | -1.3% | 86% |
| Equinor (NCS only) | 14 | **3.91%** | 4.69% | -2.6% | 57% |
| Vår Energi | 14 | **6.52%** | 7.44% | -5.0% | 57% |
| Company-reported (seed) | 5 | 6.40% | - | -5.5% | 80% |

The reported-figure average is dominated by Vår Energi 2025Q3 (275 predicted vs 370 reported):
Balder X and Johan Castberg started that summer and no decline model can see a field that is not
producing yet. The other four reported quarters average 1.6%.

**Q3 2026, the quarter with trading updates in the seed:**

| | Frozen 30 Sep (data to Jun) | Reported (trading update) | Error | Naive (Q2 reported) |
|---|---:|---:|---:|---:|
| Aker BP | 377.2 [352.9 - 398.1] | 374.3 | +0.8% | 383.6 (+2.5%) |
| Vår Energi | 364.2 [341.4 - 384.6] | 369 | -1.3% | 376 (+1.9%) |

With today's data (July and August observed, September forecast) the same quarter comes out
at 370.5 [364.0 - 377.0] for Aker BP (-1.0%) and 359.4 [351.6 - 366.5] for Vår Energi (-2.6%,
mostly the known Sodir-vs-reported gap: Sodir-attributed July-August alone is 364.8).

**Live, the open quarter (Q4 2026, made 2026-11-09, data through Aug 2026, 0 of 3 months in):**
Aker BP 373.4 [345.8 - 401.1], Vår Energi 360.6 [338.4 - 382.4], Equinor (NCS only)
1465.2 [1397.7 - 1521.8] kboe/d. The quarter-end workflow freezes the official one on 31 Dec.

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

All read `marts` only, are read-only like the rest of the API, and answer 503 (not 500) before
the first forecast run.

## Known limitations and next steps

- New fields are invisible until they appear in Sodir data (Vår Energi 2025: Balder X and
  Johan Castberg). A list of sanctioned start-ups with expected dates would fix the biggest
  misses.
- The range assumes independent field errors (see above); a one-factor correlation fitted on
  more quarters would make it honest at the company level.
- Only five reported quarters are in the seed, so "vs reported" scores rest on few points; the
  attributed scores carry the statistics until more trading updates are added.
- One data vintage for backtests (see above).
