"""Run the anomaly rule over every field and append the result to ml.anomaly_*."""

import uuid
from dataclasses import asdict, dataclass
from datetime import date

import psycopg
from psycopg.types.json import Jsonb

from stakeflow_pipeline.ml.anomalies import (
    MODEL_VERSION,
    AnomalyParams,
    Evaluation,
    FieldHistory,
    add_months,
    describe,
    evaluate_field,
)
from stakeflow_pipeline.ml.schema import ensure_ml_tables

# Anomalies are reported for the last 24 months; 17 more months are evaluated before that so
# every reported anomaly has an 18-month expected band for its mini chart.
FLAG_MONTHS = 24
CHART_MONTHS = 18
# History loaded before the first evaluated month: the seasonal profile needs 36 months
LOOKBACK_MONTHS = 36


@dataclass(frozen=True)
class AnomalyRunResult:
    run_id: uuid.UUID
    latest_month: date
    fields_evaluated: int
    anomaly_count: int


def load_histories(conn: psycopg.Connection, since: date) -> list[FieldHistory]:
    fields = conn.execute(
        "SELECT field_id, status, first_production_month, last_production_month"
        " FROM marts.dim_field ORDER BY field_id"
    ).fetchall()
    rows = conn.execute(
        "SELECT field_id, month, boe_per_day::float8 FROM marts.fct_field_production_monthly"
        " WHERE month >= %s ORDER BY field_id, month",
        (since,),
    ).fetchall()
    series: dict[int, tuple[list[date], list[float]]] = {}
    for field_id, month, rate in rows:
        months, rates = series.setdefault(field_id, ([], []))
        months.append(month)
        rates.append(rate)
    return [
        FieldHistory(field_id, *series[field_id], status, first, last)
        for field_id, status, first, last in fields
        if field_id in series
    ]


def run_anomalies(
    conn: psycopg.Connection, params: AnomalyParams | None = None
) -> AnomalyRunResult | None:
    params = params or AnomalyParams()
    row = conn.execute("SELECT max(month) FROM marts.fct_field_production_monthly").fetchone()
    latest: date | None = row[0] if row else None
    if latest is None:
        return None
    flagged_from = add_months(latest, -(FLAG_MONTHS - 1))
    evaluated_from = add_months(flagged_from, -(CHART_MONTHS - 1))
    months = [add_months(evaluated_from, i) for i in range(FLAG_MONTHS + CHART_MONTHS - 1)]

    histories = load_histories(conn, add_months(evaluated_from, -LOOKBACK_MONTHS))
    evaluations = [e for h in histories for e in evaluate_field(h, months, params)]
    anomalies = [e for e in evaluations if e.is_anomaly and e.month >= flagged_from]
    fields_judged = len({e.field_id for e in evaluations if e.expected_boe_d is not None})

    run_id = uuid.uuid4()
    with conn.transaction():
        ensure_ml_tables(conn)
        conn.execute(
            "INSERT INTO ml.anomaly_runs (run_id, model_version, params, latest_month,"
            " evaluated_from, flagged_from, fields_evaluated, anomaly_count)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                run_id,
                MODEL_VERSION,
                Jsonb(asdict(params)),
                latest,
                evaluated_from,
                flagged_from,
                fields_judged,
                len(anomalies),
            ),
        )
        with (
            conn.cursor() as cur,
            cur.copy(
                "COPY ml.anomaly_evaluations (run_id, field_id, month, actual_boe_d,"
                " expected_boe_d, lo_boe_d, hi_boe_d, sigma_log, pct_vs_expected, seasonal,"
                " is_anomaly, severity, excluded_reason, note) FROM STDIN"
            ) as copy,
        ):
            for e in evaluations:
                copy.write_row(_row(run_id, e))
    return AnomalyRunResult(run_id, latest, fields_judged, len(anomalies))


def _row(run_id: uuid.UUID, e: Evaluation) -> tuple[object, ...]:
    return (
        run_id,
        e.field_id,
        e.month,
        e.actual_boe_d,
        e.expected_boe_d,
        e.lo_boe_d,
        e.hi_boe_d,
        e.sigma_log,
        e.pct_vs_expected,
        e.seasonal,
        e.is_anomaly,
        e.severity,
        e.excluded_reason,
        describe(e) if e.is_anomaly else None,
    )
