"""Configuration from environment variables (see .env.example at the repo root)."""

import os

from psycopg.conninfo import make_conninfo


def database_conninfo() -> str:
    return make_conninfo(
        host=os.environ["POSTGRES_HOST"],
        port=os.environ["POSTGRES_PORT"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"],
    )


def sodir_base_url() -> str:
    return os.environ["SODIR_BASE_URL"]
