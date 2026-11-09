"""Configuration from environment variables (see .env.example at the repo root)."""

import os
from pathlib import Path

from psycopg.conninfo import make_conninfo

# pipeline/src/stakeflow_pipeline/settings.py → pipeline/dbt (also /app/dbt in the image)
_PIPELINE_DIR = Path(__file__).resolve().parents[2]
DBT_PROJECT_DIR = Path(os.environ.get("DBT_PROJECT_DIR", _PIPELINE_DIR / "dbt"))

# api.data.gov's shared demo key: rate-limited (about 30 requests an hour) but enough for one
# daily download. Set EIA_API_KEY to a free personal key for anything more.
EIA_DEMO_KEY = "DEMO_KEY"


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


def eia_api_key() -> str:
    return os.environ.get("EIA_API_KEY") or EIA_DEMO_KEY


def share_prices_dir() -> Path:
    """Where user-supplied share price CSVs are picked up (never committed: data/ is ignored)."""
    return Path(
        os.environ.get("SHARE_PRICES_DIR") or _PIPELINE_DIR.parent / "data" / "share_prices"
    )
