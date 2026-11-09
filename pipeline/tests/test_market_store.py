"""Market raw store against a real Postgres, using a throwaway table and source name."""

from datetime import date

import psycopg
import pytest

from stakeflow_pipeline.market.observations import MarketDataError, Observation
from stakeflow_pipeline.market.store import (
    MarketTable,
    content_hash,
    has_finished_run,
    write_observations,
)

pytestmark = pytest.mark.db

TABLE = MarketTable("market_pytest")
SOURCE = "pytest_source"


def obs(day: int, value: float) -> Observation:
    return Observation("S", date(2026, 10, day), value, "u")


@pytest.fixture
def conn(db_conn: psycopg.Connection):
    yield db_conn
    db_conn.rollback()
    db_conn.execute(psycopg.sql.SQL("DROP TABLE IF EXISTS {}").format(TABLE.identifier))
    db_conn.execute("DELETE FROM raw.market_ingestion_runs WHERE source = %s", (SOURCE,))
    db_conn.commit()


def stored(conn: psycopg.Connection) -> list[tuple[str, float]]:
    return conn.execute(
        psycopg.sql.SQL(
            "SELECT attributes->>'date', (attributes->>'value')::float FROM {} ORDER BY 1, 2"
        ).format(TABLE.identifier)
    ).fetchall()


def test_runs_append_and_identical_content_is_skipped(conn):
    assert not has_finished_run(conn, SOURCE)
    first = write_observations(conn, TABLE, SOURCE, [obs(1, 10.0)], "test", None)
    same = write_observations(conn, TABLE, SOURCE, [obs(1, 10.0)], "test", None)
    revised = write_observations(conn, TABLE, SOURCE, [obs(1, 11.0), obs(2, 12.0)], "test", None)

    assert first.run_id and revised.run_id
    assert same.run_id is None
    assert has_finished_run(conn, SOURCE)
    # Append-only: the old value stays next to the revision
    assert stored(conn) == [("2026-10-01", 10.0), ("2026-10-01", 11.0), ("2026-10-02", 12.0)]


def test_invalid_load_writes_nothing(conn):
    with pytest.raises(MarketDataError):
        write_observations(conn, TABLE, SOURCE, [obs(1, 10.0), obs(2, 0.0)], "test", None)
    runs = conn.execute(
        "SELECT count(*) FROM raw.market_ingestion_runs WHERE source = %s", (SOURCE,)
    ).fetchone()
    assert runs == (0,)


def test_content_hash_ignores_order():
    assert content_hash([obs(1, 1.0), obs(2, 2.0)]) == content_hash([obs(2, 2.0), obs(1, 1.0)])
