"""Dagster entry point: everything the webserver and daemon load."""

from dagster import Definitions, EnvVar
from dagster_dbt import DbtCliResource

from stakeflow_pipeline.assets.dbt import dbt_project, stakeflow_dbt_assets
from stakeflow_pipeline.assets.market import market_checks, market_raw_assets
from stakeflow_pipeline.assets.raw import raw_assets, raw_checks
from stakeflow_pipeline.resources import PostgresResource, SodirResource
from stakeflow_pipeline.sensors import (
    market_daily_schedule,
    market_job,
    monthly_fallback_schedule,
    refresh_job,
    sodir_new_month_sensor,
)

defs = Definitions(
    assets=[*raw_assets, *market_raw_assets, stakeflow_dbt_assets],
    asset_checks=[*raw_checks, *market_checks],
    jobs=[refresh_job, market_job],
    sensors=[sodir_new_month_sensor],
    schedules=[monthly_fallback_schedule, market_daily_schedule],
    resources={
        "dbt": DbtCliResource(project_dir=dbt_project),
        "sodir": SodirResource(base_url=EnvVar("SODIR_BASE_URL")),
        "postgres": PostgresResource(
            host=EnvVar("POSTGRES_HOST"),
            port=EnvVar.int("POSTGRES_PORT"),
            user=EnvVar("POSTGRES_USER"),
            password=EnvVar("POSTGRES_PASSWORD"),
            dbname=EnvVar("POSTGRES_DB"),
        ),
    },
)
