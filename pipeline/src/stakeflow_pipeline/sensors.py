"""When to refresh: as soon as Sodir publishes a new month, with a monthly schedule as backup.

A daily check costs one tiny API call. It also means each raw snapshot is taken within a day
of publication, so `fct_publication_lag` measures Sodir's lag to the day.
"""

from dagster import (
    AssetSelection,
    DefaultScheduleStatus,
    DefaultSensorStatus,
    RunRequest,
    ScheduleDefinition,
    SensorEvaluationContext,
    SensorResult,
    SkipReason,
    define_asset_job,
    sensor,
)

from stakeflow_pipeline.assets.market import market_raw_assets
from stakeflow_pipeline.resources import SodirResource
from stakeflow_pipeline.sodir.layers import LAYERS_BY_NAME

market_downloads = AssetSelection.assets(*market_raw_assets)

# Everything except the market downloads: a price API being down must never block (or fail) a
# Sodir refresh. Models that also read prices rebuild from whatever prices are already stored.
refresh_job = define_asset_job(
    "sodir_refresh",
    selection=AssetSelection.all() - market_downloads,
    description="Download all Sodir layers and rebuild every dbt model and ML output",
)

market_job = define_asset_job(
    "market_refresh",
    selection=market_downloads.downstream(),
    description="Download Brent, TTF and FX, import share CSVs, rebuild what depends on them",
)

SIX_HOURS = 6 * 60 * 60


@sensor(
    job=refresh_job,
    minimum_interval_seconds=SIX_HOURS,
    default_status=DefaultSensorStatus.RUNNING,
    description="Starts a refresh when Sodir's newest production month changes",
)
def sodir_new_month_sensor(
    context: SensorEvaluationContext, sodir: SodirResource
) -> SensorResult | SkipReason:
    with sodir.client() as client:
        latest = client.latest_production_month(LAYERS_BY_NAME["profiles"])
    if latest == context.cursor:
        return SkipReason(f"no new month; latest is still {latest}")
    return SensorResult(
        run_requests=[RunRequest(run_key=f"sodir-month-{latest}", tags={"sodir_month": latest})],
        cursor=latest,
    )


monthly_fallback_schedule = ScheduleDefinition(
    job=refresh_job,
    # After the 20th-of-month reporting deadline; catches revisions the sensor cannot see
    cron_schedule="0 6 25 * *",
    execution_timezone="Europe/Oslo",
    default_status=DefaultScheduleStatus.RUNNING,
)

market_daily_schedule = ScheduleDefinition(
    job=market_job,
    # Weekdays after the ECB publishes its reference rates (~16:00 CET)
    cron_schedule="30 17 * * 1-5",
    execution_timezone="Europe/Oslo",
    default_status=DefaultScheduleStatus.RUNNING,
)
