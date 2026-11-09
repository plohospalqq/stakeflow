from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient

from stakeflow_api.db import conninfo_from_env


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """API against the real database. Skips when the marts are not built (run the pipeline)."""
    try:
        with psycopg.connect(conninfo_from_env(), connect_timeout=3) as conn:
            conn.execute("select 1 from marts.meta_data_freshness")
    except (KeyError, psycopg.Error) as exc:
        pytest.skip(f"marts not available ({exc!r}); run `make up` and the pipeline")
    from stakeflow_api.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def owner_conn() -> Iterator[psycopg.Connection]:
    """A plain connection as the database owner, for checks the API itself would not run."""
    try:
        conn = psycopg.connect(conninfo_from_env(), connect_timeout=3, autocommit=True)
        conn.execute("select 1 from marts.meta_data_freshness")
    except (KeyError, psycopg.Error) as exc:
        pytest.skip(f"marts not available ({exc!r}); run `make up` and the pipeline")
    with conn:
        yield conn
