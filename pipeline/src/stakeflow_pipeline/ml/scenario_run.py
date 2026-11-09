"""Fit the scenario model for every listed focus company and append the run to ml.share_price_*.

A company without enough imported share prices still gets a row (status insufficient_data,
with the reason), so the API can say why there is no scenario instead of failing.
"""

import uuid
from dataclasses import dataclass
from datetime import date

import numpy as np
import psycopg
from psycopg.types.json import Jsonb

from stakeflow_pipeline.ml.scenario import (
    MODEL_VERSION,
    TERMS,
    MonthlyInputs,
    ScenarioModel,
    fit_scenario_model,
)
from stakeflow_pipeline.ml.schema import ensure_ml_tables

# A monthly average needs this many daily values to count
MIN_DAYS_PER_MONTH = 10


@dataclass(frozen=True)
class ScenarioRunResult:
    run_id: uuid.UUID
    models: dict[str, ScenarioModel]  # by group_id


def load_inputs(conn: psycopg.Connection, group_id: str, today: date) -> list[MonthlyInputs]:
    current_month = today.replace(day=1)
    share = dict(
        conn.execute(
            "SELECT date_trunc('month', date)::date, avg(close_nok)::float8"
            " FROM marts.fct_share_prices_daily WHERE group_id = %s"
            " GROUP BY 1 HAVING count(*) >= %s",
            (group_id, MIN_DAYS_PER_MONTH),
        ).fetchall()
    )
    production = dict(
        conn.execute(
            "SELECT month, boe_per_day::float8 FROM marts.fct_group_production_monthly"
            " WHERE group_id = %s",
            (group_id,),
        ).fetchall()
    )
    prices = {
        month: (brent, ttf, eurusd)
        for month, brent, ttf, eurusd in conn.execute(
            "SELECT month,"
            " CASE WHEN brent_days >= %(d)s THEN brent_usd_bbl::float8 END,"
            " ttf_eur_mwh::float8,"
            " CASE WHEN fx_days >= %(d)s THEN eurusd::float8 END"
            " FROM marts.fct_prices_monthly",
            {"d": MIN_DAYS_PER_MONTH},
        ).fetchall()
    }
    months = sorted(m for m in set(share) | set(production) | set(prices) if m < current_month)
    rows = []
    for m in months:
        brent, ttf, eurusd = prices.get(m, (None, None, None))
        rows.append(MonthlyInputs(m, share.get(m), brent, ttf, production.get(m), eurusd))
    return rows


def run_scenario_models(conn: psycopg.Connection, today: date) -> ScenarioRunResult:
    listings = conn.execute("SELECT group_id, ticker FROM marts.share_listings ORDER BY group_id")
    models = {
        group_id: (ticker, fit_scenario_model(load_inputs(conn, group_id, today)))
        for group_id, ticker in listings.fetchall()
    }
    run_id = uuid.uuid4()
    with conn.transaction():
        ensure_ml_tables(conn)
        for group_id, (ticker, model) in models.items():
            _write_model(conn, run_id, group_id, ticker, model)
    return ScenarioRunResult(run_id, {g: m for g, (_, m) in models.items()})


def _write_model(
    conn: psycopg.Connection, run_id: uuid.UUID, group_id: str, ticker: str, model: ScenarioModel
) -> None:
    fit = model.fit
    coefficients: list[dict[str, float | str]] = []
    covariance = None
    if fit is not None:
        std_errors = np.sqrt(np.diag(fit.covariance))
        coefficients = [
            {
                "term": t,
                "estimate": float(b),
                "std_error": float(se),
                "t_stat": float(b / se),
                "monthly_change_sd": float(sd),
            }
            for t, b, se, sd in zip(TERMS, fit.estimates, std_errors, fit.x_sd, strict=True)
        ]
        covariance = {"terms": list(TERMS), "matrix": fit.covariance.tolist()}
    conn.execute(
        "INSERT INTO ml.share_price_models (run_id, model_version, group_id, ticker, status,"
        " status_note, window_start, window_end, n_obs, coefficients, covariance, r2, adj_r2,"
        " resid_std, excluded_months, backtest_quarters, backtest_r2_in_sample,"
        " backtest_r2_out_of_sample, backtest_band_coverage)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            run_id,
            MODEL_VERSION,
            group_id,
            ticker,
            model.status,
            model.status_note,
            model.months[0] if model.months else None,
            model.months[-1] if model.months else None,
            len(model.months),
            Jsonb(coefficients),
            Jsonb(covariance) if covariance else None,
            fit.r2 if fit else None,
            fit.adj_r2 if fit else None,
            fit.resid_std if fit else None,
            Jsonb(model.excluded),
            sum(1 for q in model.backtest if q.oos is not None),
            model.r2_in_sample_quarterly,
            model.r2_out_of_sample_quarterly,
            model.band_coverage,
        ),
    )
    for q in model.backtest:
        conn.execute(
            "INSERT INTO ml.share_price_backtest (run_id, group_id, quarter_start, actual_return,"
            " fitted_return, oos_return, oos_lo, oos_hi, train_months)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                run_id,
                group_id,
                q.quarter_start,
                q.actual,
                q.fitted,
                q.oos,
                q.oos_lo,
                q.oos_hi,
                q.train_months,
            ),
        )
