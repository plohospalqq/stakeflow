"""One forecast run: field forecasts, model cards, backtests and quarterly predictions.

    stakeflow-forecast                              # live quarter + backfill backtests
    stakeflow-forecast --quarter 2026Q4 --no-backfill   # what the quarter-end workflow runs

Every run first replays the quarters since 2020 to learn how wide the range must be
(calibration.py), about four minutes on the full Sodir history; `--calibrate-from 2025Q1`
shortens that where the numbers do not matter (CI).

Reads the marts (and raw.ingestion_runs for snapshot ids), writes the `ml` schema in one
transaction. Run dbt's `tag:ml` models afterwards to refresh what the API serves.
"""

import argparse
import sys
import uuid
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np
import psycopg

from stakeflow_pipeline.forecast import calibration, field_model, nowcast, store
from stakeflow_pipeline.forecast.field_model import FieldBacktest, FieldForecast, FieldSeries
from stakeflow_pipeline.forecast.hashing import sha256_hex
from stakeflow_pipeline.forecast.periods import (
    Quarter,
    add_months,
    latest_month_available,
    months_between,
)
from stakeflow_pipeline.forecast.predictions import Kind, Prediction
from stakeflow_pipeline.forecast.store import Inputs
from stakeflow_pipeline.settings import database_conninfo

BACKFILL_FROM = Quarter(date(2023, 1, 1))
# Quarters replayed to learn how wide the range has to be (calibration.py): three years before
# the first published backtest, so that one already has 36 scored predictions behind it.
CALIBRATION_FROM = Quarter(date(2020, 1, 1))
# Longest field-level publication lag measured so far (docs/nowcast-feasibility.md). Backtests
# only see months that would surely have been out by the quarter end.
PUBLICATION_LAG_DAYS = 69
# A field is forecast if it produced at all in the last two years of data
ACTIVE_WITHIN_MONTHS = 24
# A delayed quarter-end run may still freeze the quarter it was meant for
LIVE_GRACE_DAYS = 7


@dataclass
class RunReport:
    run_id: str
    data_through: date
    statuses: Counter[str]
    backtest: dict[str, float | int | None]
    range_factor: float = 1.0
    range_scores: int = 0
    live: list[Prediction] = field(default_factory=list)
    backtests: list[Prediction] = field(default_factory=list)


def field_series(inputs: Inputs, through: date) -> dict[int, FieldSeries]:
    """Gap-free series up to `through` for every field that produced in the last two years."""
    recent = add_months(through, -(ACTIVE_WITHIN_MONTHS - 1))
    result: dict[int, FieldSeries] = {}
    for field_id, volumes in inputs.field_volumes.items():
        producing = [m for m, v in volumes.items() if v > 0 and m <= through]
        if not producing or max(producing) < recent:
            continue
        months = months_between(min(producing), through)
        values = np.array([volumes.get(m, 0.0) for m in months])
        result[field_id] = FieldSeries(field_id, months, values)
    return result


def summarize_backtests(backtests: Iterable[FieldBacktest]) -> dict[str, float | int | None]:
    """Overall backtest scores. MAPE averages fields; WAPE and bias weight them by volume."""
    items = list(backtests)
    if not items:
        return {"fields_backtested": 0}
    actual = np.concatenate([b.actual for b in items])
    model = np.concatenate([b.p50 for b in items])
    naive = np.concatenate([b.naive for b in items])
    lo = np.concatenate([b.p10 for b in items])
    hi = np.concatenate([b.p90 for b in items])
    ok = actual > 0
    total = actual[ok].sum()
    return {
        "fields_backtested": len(items),
        "backtest_mape_pct": float(np.mean([b.mape_pct() for b in items])),
        "backtest_wape_pct": float(100 * np.abs(model - actual)[ok].sum() / total),
        "backtest_bias_pct": float(100 * (model - actual)[ok].sum() / total),
        "naive_mape_pct": float(np.mean([b.naive_mape_pct() for b in items])),
        "naive_wape_pct": float(100 * np.abs(naive - actual)[ok].sum() / total),
        "naive_bias_pct": float(100 * (naive - actual)[ok].sum() / total),
        "backtest_coverage_pct": float(100 * ((actual >= lo) & (actual <= hi))[ok].mean()),
    }


@dataclass(frozen=True)
class RawQuarter:
    """One quarter's nowcasts as simulated, before the range is calibrated."""

    quarter: Quarter
    data_through: date
    results: dict[str, nowcast.QuarterNowcast]
    series: dict[int, FieldSeries]
    shares: dict[str, dict[tuple[int, date], float]]


def simulate_quarter(
    inputs: Inputs,
    quarter: Quarter,
    data_through: date,
    as_of: date,
    forecasts: dict[int, FieldForecast] | None = None,
) -> RawQuarter:
    """One nowcast per focus group. Fits the fields itself unless `forecasts` covers them."""
    series = field_series(inputs, data_through)
    horizon = nowcast.months_needed(quarter, data_through)
    shares = {
        group: nowcast.group_shares(inputs.ownership, group, quarter.months, known_at=as_of)
        for group in inputs.focus_groups
    }
    if forecasts is None:
        needed = {fid for s in shares.values() for (fid, m) in s if m > data_through}
        forecasts = {
            fid: field_model.forecast(series[fid], horizon=horizon)
            for fid in sorted(needed)
            if fid in series and horizon > 0
        }
    results = {
        group: nowcast.nowcast_quarter(
            group,
            quarter,
            data_through,
            inputs.group_volumes.get(group, {}),
            forecasts,
            shares[group],
            draws=field_model.DRAWS,
        )
        for group in inputs.focus_groups
    }
    return RawQuarter(quarter, data_through, results, series, shares)


def backtest_data_through(inputs: Inputs, quarter: Quarter) -> date:
    """The newest month a freeze at the end of `quarter` would surely have had."""
    return min(latest_month_available(quarter.end, PUBLICATION_LAG_DAYS), inputs.latest_month)


def attributed_kboe_d(inputs: Inputs, group_id: str, quarter: Quarter) -> float:
    """What Sodir's data says the group produced in the quarter (same unit as a nowcast)."""
    volumes = inputs.group_volumes.get(group_id, {})
    total = sum(volumes.get(month, 0.0) for month in quarter.months)
    return total * nowcast.BBL_PER_SM3 / quarter.days / 1000


class RangeCalibrator:
    """How much wider the simulated range must be, learned from quarters already known.

    Past quarters are replayed as backtests (once per run, then reused for every prediction and
    for the backtests that get stored), and each is scored in half-widths of its own range. A
    prediction only learns from quarters whose three months were in the data it was frozen
    with, so a backtest never sees its own future.
    """

    def __init__(self, inputs: Inputs, first: Quarter = CALIBRATION_FROM) -> None:
        self._inputs = inputs
        self._first = first
        self._replays: dict[Quarter, RawQuarter] = {}

    def backtest(self, quarter: Quarter) -> RawQuarter:
        if quarter not in self._replays:
            self._replays[quarter] = simulate_quarter(
                self._inputs,
                quarter,
                backtest_data_through(self._inputs, quarter),
                as_of=quarter.end,
            )
        return self._replays[quarter]

    def scores(self, data_through: date) -> list[float]:
        """Scores of every quarter from `first` whose actual was known with `data_through`."""
        scores: list[float] = []
        quarter = self._first
        while quarter.months[-1] <= data_through:
            for group, result in self.backtest(quarter).results.items():
                actual = attributed_kboe_d(self._inputs, group, quarter)
                value = calibration.score(actual, result.lo, result.value_kboe_d, result.hi)
                if value is not None:
                    scores.append(value)
            quarter = quarter.next()
        return scores


def predict_quarter(
    inputs: Inputs,
    raw: RawQuarter,
    scores: list[float],
    *,
    kind: Kind,
    as_of: date,
    predicted_at: datetime,
) -> list[Prediction]:
    """The simulated nowcasts with their range widened by what `scores` call for."""
    widen_by = calibration.factor(scores)
    predictions = []
    for group, result in raw.results.items():
        lo, hi = calibration.widen(result.lo, result.value_kboe_d, result.hi, widen_by)
        manifest = input_manifest(
            kind, group, raw.quarter, raw.data_through, inputs, raw.series, raw.shares[group]
        )
        manifest["range_calibration"] = {"factor": round(widen_by, 4), "scores": len(scores)}
        predictions.append(
            Prediction.from_nowcast(
                replace(result, lo=round(lo, 1), hi=round(hi, 1)),
                kind=kind,
                model_version=nowcast.MODEL_VERSION,
                predicted_at=predicted_at,
                as_of=as_of,
                inputs=manifest,
            )
        )
    return predictions


def input_manifest(
    kind: Kind,
    group_id: str,
    quarter: Quarter,
    data_through: date,
    inputs: Inputs,
    series: dict[int, FieldSeries],
    shares: dict[tuple[int, date], float],
) -> dict[str, Any]:
    """What `input_hash` commits to: versions, snapshot ids and a digest of the numbers used."""
    forecast_shares = {k: s for k, s in shares.items() if k[1] > data_through and s > 0}
    used = sorted({fid for fid, _ in forecast_shares if fid in series})
    observed = inputs.group_volumes.get(group_id, {})
    data = {
        "observed_oe_sm3": {
            m.isoformat(): round(observed[m], 3)
            for m in quarter.months
            if m <= data_through and m in observed
        },
        "fields": {
            str(fid): {
                "first_month": series[fid].months[0].isoformat(),
                "oe_sm3": [round(float(v), 3) for v in series[fid].oe_sm3],
            }
            for fid in used
        },
        "shares": {
            f"{fid}:{m.isoformat()}": round(s, 8) for (fid, m), s in sorted(forecast_shares.items())
        },
    }
    return {
        "model_version": nowcast.MODEL_VERSION,
        "field_model_version": field_model.MODEL_VERSION,
        "kind": kind,
        "group_id": group_id,
        "quarter_start": quarter.start.isoformat(),
        "data_through": data_through.isoformat(),
        "ingestion_run_ids": dict(sorted(inputs.ingestion_run_ids.items())),
        "data_sha256": sha256_hex(data),
    }


def backtest_quarters(today: date, first: Quarter = BACKFILL_FROM) -> list[Quarter]:
    """Every quarter from `first` that has ended by `today`."""
    quarters, q = [], first
    while q.end < today:
        quarters.append(q)
        q = q.next()
    return quarters


def model_card_row(run_id: str, fc: FieldForecast, bt: FieldBacktest | None) -> dict[str, Any]:
    p = fc.params
    return {
        "run_id": run_id,
        "field_id": fc.field_id,
        "status": str(fc.status),
        "method": fc.method,
        "qi_sm3_per_day": p.qi if p else None,
        "b": p.b if p else None,
        "di_nominal_per_year": p.di_per_year if p else None,
        "first_year_decline_pct": 100 * p.first_year_decline() if p else None,
        "fit_start": fc.fit_start,
        "fit_end": fc.fit_end,
        "fit_months": fc.fit_months,
        "fit_rmse_log": fc.rmse_log,
        "seasonal_swing_pct": fc.seasonal_swing_pct,
        "backtest_months": bt.scored_months if bt else None,
        "backtest_mape_pct": bt.mape_pct() if bt else None,
        "backtest_bias_pct": bt.bias_pct() if bt else None,
        "naive_mape_pct": bt.naive_mape_pct() if bt else None,
        "naive_bias_pct": bt.naive_bias_pct() if bt else None,
        "backtest_coverage_pct": bt.coverage_pct() if bt else None,
    }


def forecast_rows(run_id: str, fc: FieldForecast) -> list[dict[str, Any]]:
    if fc.status is field_model.Status.SHUT_DOWN:
        return []
    p10, p50, p90 = fc.quantiles()
    return [
        {
            "run_id": run_id,
            "field_id": fc.field_id,
            "month": month,
            "p10_oe_sm3": float(lo),
            "p50_oe_sm3": float(mid),
            "p90_oe_sm3": float(hi),
        }
        for month, lo, mid, hi in zip(fc.months, p10, p50, p90, strict=True)
    ]


def run_forecasts(
    conn: psycopg.Connection,
    live_quarter: Quarter | None = None,
    backfill_from: Quarter | None = BACKFILL_FROM,
    calibrate_from: Quarter = CALIBRATION_FROM,
) -> RunReport:
    """Live predictions are always stamped with the real clock: no way to backdate one."""
    started = datetime.now(UTC).replace(microsecond=0)
    today = started.date()
    quarter = live_quarter or Quarter.containing(today)
    if quarter.end < today - timedelta(days=LIVE_GRACE_DAYS):
        raise ValueError(f"{quarter.label} has ended; a live prediction must be made before")

    store.ensure_tables(conn)
    inputs = store.load_inputs(conn)
    known_hashes = store.existing_input_hashes(conn)
    done = store.existing_backtests(conn, nowcast.MODEL_VERSION)
    # Commit the DDL and end the read transaction: the fitting below takes minutes and must not
    # hold locks on the ml tables meanwhile. All writes happen in one transaction at the end.
    conn.commit()
    if nowcast.months_needed(quarter, inputs.latest_month) > field_model.HORIZON_MONTHS:
        raise ValueError(
            f"{quarter.label} is beyond the {field_model.HORIZON_MONTHS}-month horizon"
        )
    run_id = str(uuid.uuid4())

    series = field_series(inputs, inputs.latest_month)
    forecasts = {fid: field_model.forecast(s) for fid, s in series.items()}
    backtests = {fid: bt for fid, s in series.items() if (bt := field_model.backtest(s))}
    summary = summarize_backtests(backtests.values())

    calibrator = RangeCalibrator(inputs, first=calibrate_from)
    live_scores = calibrator.scores(inputs.latest_month)
    live = predict_quarter(
        inputs,
        simulate_quarter(inputs, quarter, inputs.latest_month, as_of=today, forecasts=forecasts),
        live_scores,
        kind="live",
        as_of=today,
        predicted_at=started,
    )
    live = [p for p in live if p.input_hash not in known_hashes]

    replayed: list[Prediction] = []
    if backfill_from is not None:
        for q in backtest_quarters(today, backfill_from):
            if all((g, q.start) in done for g in inputs.focus_groups):
                continue
            raw = calibrator.backtest(q)
            batch = predict_quarter(
                inputs,
                raw,
                calibrator.scores(raw.data_through),
                kind="backtest",
                as_of=q.end,
                predicted_at=started,
            )
            replayed += [p for p in batch if (p.group_id, q.start) not in done]

    finished = datetime.now(UTC)
    with conn.transaction():
        store.insert_rows(
            conn,
            "model_runs",
            [
                {
                    "run_id": run_id,
                    "model_version": field_model.MODEL_VERSION,
                    "started_at": started,
                    "finished_at": finished,
                    "data_through": inputs.latest_month,
                    "ingestion_run_ids": inputs.ingestion_run_ids,
                    "params": run_params()
                    | {
                        "range_calibrated_from": calibrate_from.label,
                        "range_factor": round(calibration.factor(live_scores), 4),
                        "range_scores": len(live_scores),
                    },
                    "fields_total": len(forecasts),
                    "fields_arps": sum(
                        f.status is field_model.Status.ARPS for f in forecasts.values()
                    ),
                    **summary,
                }
            ],
        )
        store.insert_rows(
            conn,
            "field_forecast",
            [row for fc in forecasts.values() for row in forecast_rows(run_id, fc)],
        )
        store.insert_rows(
            conn,
            "field_model_card",
            [model_card_row(run_id, fc, backtests.get(fid)) for fid, fc in forecasts.items()],
        )
        store.insert_rows(conn, "predictions", [p.db_row(run_id) for p in live + replayed])

    return RunReport(
        run_id=run_id,
        data_through=inputs.latest_month,
        statuses=Counter(str(f.status) for f in forecasts.values()),
        backtest=summary,
        range_factor=calibration.factor(live_scores),
        range_scores=len(live_scores),
        live=live,
        backtests=replayed,
    )


def run_params() -> dict[str, Any]:
    return {
        "nowcast_version": nowcast.MODEL_VERSION,
        "horizon_months": field_model.HORIZON_MONTHS,
        "draws": field_model.DRAWS,
        "block_months": field_model.BLOCK_MONTHS,
        "interval": list(field_model.INTERVAL),
        "backtest_months": field_model.BACKTEST_MONTHS,
        "publication_lag_days": PUBLICATION_LAG_DAYS,
        "seed": field_model.SEED,
        "range_level": calibration.LEVEL,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="stakeflow-forecast", description=__doc__)
    parser.add_argument("--quarter", type=Quarter.parse, help="live quarter, e.g. 2026Q4")
    parser.add_argument(
        "--backfill-from",
        type=Quarter.parse,
        default=BACKFILL_FROM,
        help=f"first quarter to replay as a backtest (default {BACKFILL_FROM.label})",
    )
    parser.add_argument(
        "--no-backfill", action="store_true", help="skip replaying past quarters (backtests)"
    )
    parser.add_argument(
        "--calibrate-from",
        type=Quarter.parse,
        default=CALIBRATION_FROM,
        help="first quarter replayed to calibrate the range; each one takes a few seconds"
        f" (default {CALIBRATION_FROM.label})",
    )
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)

    with psycopg.connect(database_conninfo()) as conn:
        report = run_forecasts(
            conn,
            live_quarter=args.quarter,
            backfill_from=None if args.no_backfill else args.backfill_from,
            calibrate_from=args.calibrate_from,
        )

    print(f"run {report.run_id}  data through {report.data_through:%Y-%m}")
    print("fields: " + ", ".join(f"{k} {v}" for k, v in sorted(report.statuses.items())))
    for key, value in report.backtest.items():
        print(f"  {key:<24} {value:.2f}" if isinstance(value, float) else f"  {key:<24} {value}")
    print(
        f"range: x{report.range_factor:.2f} wider than simulated"
        f" (80th percentile of {report.range_scores} scored quarters)"
    )
    for p in report.live + report.backtests:
        print(
            f"{p.kind:<8} {p.group_id:<11} {p.quarter_start}  {p.value_kboe_d:7.1f}"
            f"  [{p.lo:.1f}, {p.hi:.1f}]  data through {p.data_through:%Y-%m}"
        )
    if not report.live:
        print("live: no new prediction (same inputs as an existing one)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
