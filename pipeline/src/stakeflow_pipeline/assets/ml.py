"""The forecast run as Dagster assets: after the marts, before the ml dbt models.

One run writes four append-only tables together (one transaction), so they are one
multi-asset. The dbt sources for them carry the same keys (dbt/models/ml/_ml.yml), which puts
the API-facing ml models downstream automatically.
"""

from collections.abc import Iterator

from dagster import AssetKey, AssetSpec, MaterializeResult, multi_asset

from stakeflow_pipeline.forecast.run import run_forecasts
from stakeflow_pipeline.resources import PostgresResource

ML_TABLES = ("model_runs", "field_forecast", "field_model_card", "predictions")

MARTS_READ = (
    "fct_field_production_monthly",
    "fct_group_production_monthly",
    "fct_field_ownership",
    "dim_company_group",
)


@multi_asset(
    specs=[
        AssetSpec(
            AssetKey(["ml", table]),
            deps=[AssetKey(["marts", name]) for name in MARTS_READ],
            group_name="ml",
            kinds={"python", "postgres"},
            description=f"Forecast run output: ml.{table} (append-only)",
        )
        for table in ML_TABLES
    ],
)
def forecast_run(postgres: PostgresResource) -> Iterator[MaterializeResult]:
    """Arps forecasts per field, backtests, and the live + backfilled quarterly predictions."""
    with postgres.connect() as conn:
        report = run_forecasts(conn)
    shared = {"run_id": report.run_id, "data_through": report.data_through.isoformat()}
    yield MaterializeResult(
        asset_key=AssetKey(["ml", "model_runs"]),
        metadata={**shared, **{k: v for k, v in report.backtest.items() if v is not None}},
    )
    yield MaterializeResult(asset_key=AssetKey(["ml", "field_forecast"]), metadata=shared)
    yield MaterializeResult(
        asset_key=AssetKey(["ml", "field_model_card"]),
        metadata={**shared, **{f"fields_{k}": v for k, v in report.statuses.items()}},
    )
    yield MaterializeResult(
        asset_key=AssetKey(["ml", "predictions"]),
        metadata={
            **shared,
            "live_added": len(report.live),
            "backtests_added": len(report.backtests),
        },
    )
