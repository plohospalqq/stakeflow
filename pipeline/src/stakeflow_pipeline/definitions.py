"""Dagster entry point: everything the webserver and daemon load."""

from dagster import Definitions, EnvVar

from stakeflow_pipeline.assets.raw import raw_assets, raw_checks
from stakeflow_pipeline.resources import PostgresResource, SodirResource
from stakeflow_pipeline.sensors import (
    monthly_fallback_schedule,
    refresh_job,
    sodir_new_month_sensor,
)

defs = Definitions(
    assets=raw_assets,
    asset_checks=raw_checks,
    jobs=[refresh_job],
    sensors=[sodir_new_month_sensor],
    schedules=[monthly_fallback_schedule],
    resources={
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
