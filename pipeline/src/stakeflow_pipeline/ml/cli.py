"""CLI: run the ML models on the current marts, without Dagster.

    stakeflow-ml              # every model
    stakeflow-ml anomalies    # one model (anomalies, scenarios)

Each run appends to the `ml` schema; the marts views then show it.
"""

import sys
from collections.abc import Callable
from datetime import date

import psycopg

from stakeflow_pipeline.ml.anomaly_run import run_anomalies
from stakeflow_pipeline.ml.scenario_run import run_scenario_models
from stakeflow_pipeline.settings import database_conninfo


def _anomalies(conn: psycopg.Connection) -> str:
    result = run_anomalies(conn)
    if result is None:
        return "no production data in marts yet"
    return (
        f"run={result.run_id} latest={result.latest_month} fields={result.fields_evaluated} "
        f"anomalies={result.anomaly_count}"
    )


def _scenarios(conn: psycopg.Connection) -> str:
    result = run_scenario_models(conn, date.today())
    summary = ", ".join(
        f"{group}: {m.status}"
        + (f" n={len(m.months)} R²={m.fit.r2:.2f}" if m.fit else f" ({m.status_note})")
        for group, m in result.models.items()
    )
    return f"run={result.run_id} {summary}"


MODELS: dict[str, Callable[[psycopg.Connection], str]] = {
    "anomalies": _anomalies,
    "scenarios": _scenarios,
}


def main(argv: list[str] | None = None) -> int:
    names = sys.argv[1:] if argv is None else argv
    unknown = [n for n in names if n not in MODELS]
    if unknown:
        print(f"unknown models: {unknown}. Known: {list(MODELS)}", file=sys.stderr)
        return 2
    with psycopg.connect(database_conninfo()) as conn:
        for name in names or list(MODELS):
            print(f"{name:<12} {MODELS[name](conn)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
