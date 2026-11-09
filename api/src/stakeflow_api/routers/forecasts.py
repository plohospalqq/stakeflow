"""Phase 2: field forecasts, the open-quarter nowcasts and the public prediction log.

All three read marts built from the forecast run (dbt models tagged `ml`). Before the first
run those tables do not exist; the API answers 503 instead of failing with a 500.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from psycopg.errors import UndefinedTable

from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.schemas import (
    FieldForecast,
    FitWindow,
    ForecastPoint,
    ModelCard,
    Nowcast,
    PredictionKind,
    PredictionRecord,
)

router = APIRouter(tags=["forecasts"])
Conn = Annotated[Connection, Depends(get_conn)]


@contextmanager
def _forecasts_built() -> Iterator[None]:
    try:
        yield
    except UndefinedTable as exc:
        raise HTTPException(503, "forecasts not built yet; run the forecast pipeline") from exc


@router.get(
    "/fields/{field_id}/forecast", response_model=FieldForecast, response_model_by_alias=True
)
def field_forecast(field_id: int, conn: Conn) -> FieldForecast:
    """36 months of p10 / p50 / p90 (Sm³ o.e. per month) and the model card.

    The first point repeats the last actual month so a chart line continues from history.
    Shut-down fields return their model card with no points.
    """
    with _forecasts_built():
        card = fetch_one(
            conn,
            "select * from marts.fct_field_model_card where field_id = %(id)s",
            {"id": field_id},
        )
        if card is None:
            raise HTTPException(404, f"no forecast for field {field_id}")
        rows = fetch_all(
            conn,
            """
            select month, p10_oe_sm3 as p10, p50_oe_sm3 as p50, p90_oe_sm3 as p90
            from marts.fct_field_forecast
            where field_id = %(id)s
            order by month
            """,
            {"id": field_id},
        )
    points = [ForecastPoint(**r) for r in rows]
    last = fetch_one(
        conn,
        """
        select month, oe_sm3 from marts.fct_field_production_monthly
        where field_id = %(id)s and month <= %(through)s
        order by month desc limit 1
        """,
        {"id": field_id, "through": card["data_through"]},
    )
    if points and last is not None:
        actual = float(last["oe_sm3"])
        points.insert(
            0,
            ForecastPoint(month=last["month"], p10=actual, p50=actual, p90=actual, is_actual=True),
        )
    return FieldForecast(field_id=field_id, points=points, model=_model_card(card), events=[])


def _model_card(row: dict) -> ModelCard:
    window = (
        FitWindow(start=row["fit_start"], end=row["fit_end"])
        if row["fit_start"] is not None
        else None
    )
    return ModelCard(
        method=row["method"],
        status=row["status"],
        b=row["b"],
        initial_decline_pct_per_year=row["first_year_decline_pct"],
        di_nominal_per_year=row["di_nominal_per_year"],
        qi_sm3_per_day=row["qi_sm3_per_day"],
        fit_window=window,
        fit_months=row["fit_months"],
        seasonal_swing_pct=row["seasonal_swing_pct"],
        backtest_error_pct=row["backtest_mape_pct"],
        backtest_bias_pct=row["backtest_bias_pct"],
        naive_error_pct=row["naive_mape_pct"],
        backtest_coverage_pct=row["backtest_coverage_pct"],
        run_at=row["run_at"],
        version=row["model_version"],
        data_through=row["data_through"],
    )


@router.get("/nowcasts", response_model=list[Nowcast], response_model_by_alias=True)
def nowcasts(conn: Conn) -> list[Nowcast]:
    """Newest live prediction per focus company, for the latest quarter predicted (kboe/d)."""
    with _forecasts_built():
        rows = fetch_all(
            conn,
            """
            select distinct on (group_id) *
            from marts.fct_prediction_scores
            where kind = 'live'
            order by group_id, quarter_start desc, predicted_at desc
            """,
        )
    return [
        Nowcast(
            company_id=r["group_id"],
            company_name=r["group_name"],
            quarter_start=r["quarter_start"],
            value=float(r["value_kboe_d"]),
            lo=float(r["lo"]),
            hi=float(r["hi"]),
            made_at=r["predicted_at"],
            data_through=r["data_through"],
            months_in_data=r["months_in_data"],
            model_version=r["model_version"],
            hash=r["prediction_hash"],
            input_hash=r["input_hash"],
            status=r["status"],
            expected_report_on=r["expected_report_on"],
            report_kind=r["report_kind"],
        )
        for r in rows
    ]


@router.get("/predictions", response_model=list[PredictionRecord], response_model_by_alias=True)
def predictions(
    conn: Conn,
    company: Annotated[str | None, Query(max_length=40, description="Company id")] = None,
    kind: Annotated[PredictionKind | None, Query()] = None,
    latest: Annotated[
        bool, Query(description="Only the newest prediction per quarter, kind and model")
    ] = False,
) -> list[PredictionRecord]:
    """The prediction log: every live and backtest prediction, actuals, errors and hashes."""
    with _forecasts_built():
        rows = fetch_all(
            conn,
            """
            select *
            from marts.fct_prediction_scores
            where (%(company)s::text is null or group_id = %(company)s)
              and (%(kind)s::text is null or kind = %(kind)s)
              and (not %(latest)s or is_latest)
            order by quarter_start, group_id, kind, predicted_at
            """,
            {"company": company, "kind": kind, "latest": latest},
        )
    return [_record(r) for r in rows]


def _float(value: object) -> float | None:
    return None if value is None else float(value)  # type: ignore[arg-type]


def _record(r: dict) -> PredictionRecord:
    return PredictionRecord(
        id=str(r["prediction_id"]),
        company_id=r["group_id"],
        company_name=r["group_name"],
        quarter_start=r["quarter_start"],
        kind=r["kind"],
        is_latest=r["is_latest"],
        made_at=r["predicted_at"],
        as_of=r["as_of"],
        data_through=r["data_through"],
        months_in_data=r["months_in_data"],
        predicted=float(r["value_kboe_d"]),
        lo=float(r["lo"]),
        hi=float(r["hi"]),
        model_version=r["model_version"],
        status=r["status"],
        expected_report_on=r["expected_report_on"],
        report_kind=r["report_kind"],
        reported_on=r["reported_on"],
        actual=_float(r["actual_kboe_d"]),
        error_pct=_float(r["error_pct"]),
        in_range=r["in_range"],
        baseline=_float(r["baseline_kboe_d"]),
        baseline_error_pct=_float(r["baseline_error_pct"]),
        attributed_actual=_float(r["attributed_kboe_d"]),
        attributed_error_pct=_float(r["attributed_error_pct"]),
        attributed_in_range=r["attributed_in_range"],
        attributed_baseline=_float(r["attributed_baseline_kboe_d"]),
        attributed_baseline_error_pct=_float(r["attributed_baseline_error_pct"]),
        hash=r["prediction_hash"],
        input_hash=r["input_hash"],
    )
