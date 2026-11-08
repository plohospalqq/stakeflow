from collections.abc import Iterator

import psycopg
import pytest

from stakeflow_pipeline.settings import database_conninfo


@pytest.fixture
def db_conn() -> Iterator[psycopg.Connection]:
    """Connection to the compose database. Skips the test when it is not running."""
    try:
        conn = psycopg.connect(database_conninfo(), connect_timeout=3)
    except (KeyError, psycopg.OperationalError) as exc:
        pytest.skip(f"database not available ({exc!r}); run `make up`")
    with conn:
        yield conn
