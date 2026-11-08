"""One Dagster asset per Sodir layer, each landing a snapshot in raw.sodir_<layer>.

Asset keys are ["raw", "sodir_<layer>"], which is also how dbt names its sources, so the dbt
models line up downstream automatically.
"""

from datetime import date, timedelta

from dagster import (
    AssetCheckResult,
    AssetChecksDefinition,
    AssetCheckSeverity,
    AssetKey,
    AssetsDefinition,
    Backoff,
    MaterializeResult,
    RetryPolicy,
    asset,
    asset_check,
)

from stakeflow_pipeline.ingest import ingest_layer
from stakeflow_pipeline.resources import PostgresResource, SodirResource
from stakeflow_pipeline.sodir.layers import LAYERS, Layer

# Sodir's ArcGIS server has short hiccups; three retries with backoff ride them out
SODIR_RETRY = RetryPolicy(max_retries=3, delay=30, backoff=Backoff.EXPONENTIAL)

# Sodir rarely deletes rows. A big drop between snapshots means a broken export, not reality
MAX_ROW_DROP = 0.05

# Field-level data lands 40-69 days after month end (docs/nowcast-feasibility.md).
# Older than this means Sodir or our sensor has stalled
MAX_PRODUCTION_AGE_DAYS = 100


def raw_key(layer: Layer) -> AssetKey:
    return AssetKey(["raw", f"sodir_{layer.name}"])


def build_raw_asset(layer: Layer) -> AssetsDefinition:
    @asset(
        key=raw_key(layer),
        group_name="raw",
        retry_policy=SODIR_RETRY,
        kinds={"python", "postgres"},
        description=f"Sodir DataService layer {layer.id} ({layer.name}), append-only snapshots",
    )
    def _raw_asset(sodir: SodirResource, postgres: PostgresResource) -> MaterializeResult:
        with sodir.client() as client, postgres.connect() as conn:
            result = ingest_layer(client, conn, layer)
        return MaterializeResult(
            metadata={"row_count": result.row_count, "ingestion_run_id": str(result.run_id)}
        )

    return _raw_asset


def build_row_drop_check(layer: Layer) -> AssetChecksDefinition:
    @asset_check(
        asset=raw_key(layer),
        name="no_large_row_drop",
        description=f"Latest snapshot has at most {MAX_ROW_DROP:.0%} fewer rows than the previous",
    )
    def _check(postgres: PostgresResource) -> AssetCheckResult:
        with postgres.connect() as conn:
            counts = [
                row[0]
                for row in conn.execute(
                    "SELECT row_count FROM raw.ingestion_runs"
                    " WHERE layer = %s AND finished_at IS NOT NULL"
                    " ORDER BY finished_at DESC LIMIT 2",
                    (layer.name,),
                ).fetchall()
            ]
        if len(counts) < 2:
            return AssetCheckResult(passed=True, metadata={"note": "first snapshot"})
        latest, previous = counts
        passed = latest >= previous * (1 - MAX_ROW_DROP)
        return AssetCheckResult(
            passed=passed,
            severity=AssetCheckSeverity.ERROR,
            metadata={"latest": latest, "previous": previous},
        )

    return _check


LATEST_MONTH_SQL = """
SELECT max(make_date((attributes->>'prfYear')::int, (attributes->>'prfMonth')::int, 1))
FROM raw.sodir_profiles
WHERE attributes->>'prfPeriod' = 'month'
  AND ingestion_run_id = (
      SELECT run_id FROM raw.ingestion_runs
      WHERE layer = 'profiles' AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1
  )
"""


@asset_check(
    asset=AssetKey(["raw", "sodir_profiles"]),
    name="production_is_fresh",
    description=f"Newest month is at most {MAX_PRODUCTION_AGE_DAYS} days past its month end",
)
def production_is_fresh(postgres: PostgresResource) -> AssetCheckResult:
    with postgres.connect() as conn:
        row = conn.execute(LATEST_MONTH_SQL).fetchone()
    latest_month: date | None = row[0] if row else None
    if latest_month is None:
        return AssetCheckResult(passed=False, metadata={"note": "no monthly production rows"})
    month_end = (latest_month + timedelta(days=32)).replace(day=1)
    age_days = (date.today() - month_end).days
    return AssetCheckResult(
        passed=age_days <= MAX_PRODUCTION_AGE_DAYS,
        severity=AssetCheckSeverity.WARN,
        metadata={"latest_month": latest_month.isoformat(), "days_since_month_end": age_days},
    )


raw_assets = [build_raw_asset(layer) for layer in LAYERS]
raw_checks = [build_row_drop_check(layer) for layer in LAYERS] + [production_is_fresh]
