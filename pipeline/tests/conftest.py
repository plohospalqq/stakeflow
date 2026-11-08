import os
import subprocess
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest

from stakeflow_pipeline.settings import database_conninfo

DBT_DIR = Path(__file__).resolve().parents[1] / "dbt"


def pytest_configure(config: pytest.Config) -> None:
    """dagster-dbt reads dbt's manifest at import time; build it once if missing (no DB needed)."""
    if (DBT_DIR / "target" / "manifest.json").exists():
        return
    env = {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "x",
        "POSTGRES_PASSWORD": "x",
        "POSTGRES_DB": "x",
        **os.environ,
    }
    subprocess.run(
        ["dbt", "parse", "--project-dir", str(DBT_DIR), "--profiles-dir", str(DBT_DIR), "--quiet"],
        check=True,
        env=env,
    )


@pytest.fixture
def db_conn() -> Iterator[psycopg.Connection]:
    """Connection to the compose database. Skips the test when it is not running."""
    try:
        conn = psycopg.connect(database_conninfo(), connect_timeout=3)
    except (KeyError, psycopg.OperationalError) as exc:
        pytest.skip(f"database not available ({exc!r}); run `make up`")
    with conn:
        yield conn
