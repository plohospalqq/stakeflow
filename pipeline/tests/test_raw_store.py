"""raw_store against the real compose Postgres, using a throwaway layer table."""

import psycopg
import pytest

from stakeflow_pipeline.raw_store import RowCountMismatch, raw_table, write_snapshot
from stakeflow_pipeline.sodir.client import Feature
from stakeflow_pipeline.sodir.layers import Layer

pytestmark = pytest.mark.db

TEST_LAYER = Layer(0, "pytest_layer", has_geometry=True)

PAGES = [
    [
        Feature(properties={"OBJECTID": 1, "fldName": "A"}, geometry=None),
        Feature(
            properties={"OBJECTID": 2, "fldName": "B"},
            geometry={"type": "Point", "coordinates": [2.6, 58.6]},
        ),
    ],
    [Feature(properties={"OBJECTID": 3, "fldName": "C"})],
]


@pytest.fixture
def conn(db_conn: psycopg.Connection):
    yield db_conn
    db_conn.execute(psycopg.sql.SQL("DROP TABLE IF EXISTS {}").format(raw_table(TEST_LAYER)))
    db_conn.execute("DELETE FROM raw.ingestion_runs WHERE layer = %s", (TEST_LAYER.name,))
    db_conn.commit()


def test_snapshot_is_written_with_run_metadata(conn):
    result = write_snapshot(conn, TEST_LAYER, PAGES, expected_count=3)

    rows = conn.execute(
        psycopg.sql.SQL(
            "SELECT attributes->>'fldName', geometry->>'type' FROM {} "
            "WHERE ingestion_run_id = %s ORDER BY 1"
        ).format(raw_table(TEST_LAYER)),
        (result.run_id,),
    ).fetchall()
    assert rows == [("A", None), ("B", "Point"), ("C", None)]

    run = conn.execute(
        "SELECT row_count, expected_count, finished_at IS NOT NULL "
        "FROM raw.ingestion_runs WHERE run_id = %s",
        (result.run_id,),
    ).fetchone()
    assert run == (3, 3, True)


def test_second_run_appends_instead_of_replacing(conn):
    write_snapshot(conn, TEST_LAYER, PAGES, expected_count=3)
    write_snapshot(conn, TEST_LAYER, PAGES, expected_count=3)

    count = conn.execute(
        psycopg.sql.SQL("SELECT count(DISTINCT ingestion_run_id), count(*) FROM {}").format(
            raw_table(TEST_LAYER)
        )
    ).fetchone()
    assert count == (2, 6)


def test_count_mismatch_writes_nothing(conn):
    with pytest.raises(RowCountMismatch):
        write_snapshot(conn, TEST_LAYER, PAGES, expected_count=4)

    runs = conn.execute(
        "SELECT count(*) FROM raw.ingestion_runs WHERE layer = %s", (TEST_LAYER.name,)
    ).fetchone()
    assert runs == (0,)
