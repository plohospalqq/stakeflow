"""Market data assets: one per raw.market_* table, plus a freshness check per public source.

Keys are ["raw", "market_<source>"], which is how dbt names these sources, so the price models
line up downstream. They run on their own daily schedule (sensors.py), never inside the Sodir
refresh, so a price source being down can never block production data.
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
from psycopg import sql

from stakeflow_pipeline.market.ingest import (
    LISTINGS_SEED,
    PUBLIC_SOURCES,
    PublicSource,
    import_share_csv,
    ingest_public_source,
    make_http_client,
    share_csv_files,
)
from stakeflow_pipeline.market.share_prices import load_listings
from stakeflow_pipeline.market.store import SHARE_PRICES, MarketRun, MarketTable
from stakeflow_pipeline.resources import PostgresResource
from stakeflow_pipeline.settings import share_prices_dir

# Public APIs have short outages (the ECB gateway returns 504 now and then)
MARKET_RETRY = RetryPolicy(max_retries=3, delay=60, backoff=Backoff.EXPONENTIAL)

# Newest observation older than this means the source or our schedule has stalled.
# EIA publishes spot prices weekly; the World Bank publishes the previous month early each month.
MAX_AGE_DAYS = {"eia_brent": 14, "ecb_fx": 7, "worldbank_pink_sheet": 75}


def market_key(table: MarketTable) -> AssetKey:
    return AssetKey(["raw", table.name])


def _metadata(runs: list[MarketRun]) -> dict[str, int | str]:
    return {
        "rows_written": sum(r.row_count for r in runs),
        "runs": ", ".join(f"{r.source}={r.run_id or 'unchanged'}" for r in runs),
    }


def build_public_asset(source: PublicSource) -> AssetsDefinition:
    @asset(
        key=market_key(source.table),
        group_name="raw",
        retry_policy=MARKET_RETRY,
        kinds={"python", "postgres"},
        description=f"{source.name}: append-only market data (docs/market-data-sources.md)",
    )
    def _asset(postgres: PostgresResource) -> MaterializeResult:
        with make_http_client() as http, postgres.connect() as conn:
            run = ingest_public_source(conn, http, source, date.today())
        return MaterializeResult(metadata=_metadata([run]))

    return _asset


@asset(
    key=market_key(SHARE_PRICES),
    group_name="raw",
    kinds={"python", "postgres"},
    description=(
        "Share price CSVs the user put in SHARE_PRICES_DIR (local only, never downloaded by "
        "Stakeflow, never committed). Does nothing when the folder is empty."
    ),
)
def share_prices_asset(postgres: PostgresResource) -> MaterializeResult:
    files = share_csv_files(share_prices_dir())
    if not files:
        return MaterializeResult(metadata={"note": f"no CSV files in {share_prices_dir()}"})
    listings = load_listings(LISTINGS_SEED)
    with postgres.connect() as conn:
        runs = [import_share_csv(conn, path, listings, date.today()) for path in files]
    return MaterializeResult(metadata=_metadata(runs))


def build_freshness_check(source: PublicSource) -> AssetChecksDefinition:
    max_age = MAX_AGE_DAYS[source.name]

    @asset_check(
        asset=market_key(source.table),
        name="is_fresh",
        description=f"Newest observation is at most {max_age} days old",
    )
    def _check(postgres: PostgresResource) -> AssetCheckResult:
        with postgres.connect() as conn:
            row = conn.execute(
                sql.SQL("SELECT max((attributes->>'date')::date) FROM {}").format(
                    source.table.identifier
                )
            ).fetchone()
        newest: date | None = row[0] if row else None
        if newest is None:
            return AssetCheckResult(passed=False, metadata={"note": "no observations"})
        return AssetCheckResult(
            passed=date.today() - newest <= timedelta(days=max_age),
            severity=AssetCheckSeverity.WARN,
            metadata={"newest": newest.isoformat(), "max_age_days": max_age},
        )

    return _check


market_raw_assets = [*(build_public_asset(s) for s in PUBLIC_SOURCES), share_prices_asset]
market_checks = [build_freshness_check(s) for s in PUBLIC_SOURCES]
