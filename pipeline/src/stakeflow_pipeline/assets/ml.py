"""ML assets: Python models that read the marts and append their results to the `ml` schema.

Each asset produces one key per table it writes (["ml", <table>]), which is how dbt names its
`ml` sources, so the dbt views over them (tag `ml`, a separate dbt asset group) sit downstream:
marts → Python model → ml views, without a cycle.
"""

from collections.abc import Iterator
from datetime import date

from dagster import AssetKey, AssetSpec, MaterializeResult, multi_asset

from stakeflow_pipeline.ml.anomalies import MODEL_VERSION as ANOMALY_MODEL_VERSION
from stakeflow_pipeline.ml.anomaly_run import run_anomalies
from stakeflow_pipeline.ml.scenario import MODEL_VERSION as SCENARIO_MODEL_VERSION
from stakeflow_pipeline.ml.scenario_run import run_scenario_models
from stakeflow_pipeline.resources import PostgresResource

ANOMALY_RUNS = AssetKey(["ml", "anomaly_runs"])
ANOMALY_EVALUATIONS = AssetKey(["ml", "anomaly_evaluations"])
_PRODUCTION = [
    AssetKey(["marts", "fct_field_production_monthly"]),
    AssetKey(["marts", "dim_field"]),
]


@multi_asset(
    name="anomalies",
    group_name="ml",
    specs=[
        AssetSpec(ANOMALY_RUNS, deps=_PRODUCTION, kinds={"python", "postgres"}),
        AssetSpec(ANOMALY_EVALUATIONS, deps=_PRODUCTION, kinds={"python", "postgres"}),
    ],
    description=(
        "Monthly field production more than 10% and 3 robust sigmas from its own trend "
        f"({ANOMALY_MODEL_VERSION}); appends one run"
    ),
)
def anomalies_asset(postgres: PostgresResource) -> Iterator[MaterializeResult]:
    with postgres.connect() as conn:
        result = run_anomalies(conn)
    metadata: dict[str, str | int] = (
        {"note": "no production data in marts yet"}
        if result is None
        else {
            "run_id": str(result.run_id),
            "latest_month": result.latest_month.isoformat(),
            "fields": result.fields_evaluated,
            "anomalies": result.anomaly_count,
        }
    )
    for key in (ANOMALY_RUNS, ANOMALY_EVALUATIONS):
        yield MaterializeResult(asset_key=key, metadata=metadata)


SHARE_PRICE_MODELS = AssetKey(["ml", "share_price_models"])
SHARE_PRICE_BACKTEST = AssetKey(["ml", "share_price_backtest"])
_SCENARIO_INPUTS = [
    AssetKey(["marts", "fct_prices_monthly"]),
    AssetKey(["marts", "fct_share_prices_daily"]),
    AssetKey(["marts", "fct_group_production_monthly"]),
    AssetKey(["marts", "share_listings"]),
]


@multi_asset(
    name="share_price_models",
    group_name="ml",
    specs=[
        AssetSpec(SHARE_PRICE_MODELS, deps=_SCENARIO_INPUTS, kinds={"python", "postgres"}),
        AssetSpec(SHARE_PRICE_BACKTEST, deps=_SCENARIO_INPUTS, kinds={"python", "postgres"}),
    ],
    description=(
        "Share-price sensitivities to Brent, TTF, production and EUR/USD for the what-if "
        f"scenario explorer ({SCENARIO_MODEL_VERSION}), with a quarterly backtest. Not a forecast."
    ),
)
def share_price_models_asset(postgres: PostgresResource) -> Iterator[MaterializeResult]:
    with postgres.connect() as conn:
        result = run_scenario_models(conn, date.today())
    metadata: dict[str, str | float] = {"run_id": str(result.run_id)}
    for group_id, model in result.models.items():
        metadata[group_id] = model.status
        if model.fit is not None:
            metadata[f"{group_id}_r2"] = round(model.fit.r2, 3)
    for key in (SHARE_PRICE_MODELS, SHARE_PRICE_BACKTEST):
        yield MaterializeResult(asset_key=key, metadata=metadata)


ml_assets = [anomalies_asset, share_price_models_asset]
