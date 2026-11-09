"""The ml schema on a real Postgres: append-only, hash round-trip, public export.

Everything runs inside one transaction that is rolled back, so no test row survives (the
append-only trigger would not let us delete it).
"""

import json
from dataclasses import replace
from datetime import UTC, date, datetime

import psycopg
import pytest
from psycopg.rows import dict_row

from stakeflow_pipeline.forecast import export, store
from stakeflow_pipeline.forecast.hashing import canonical_json, sha256_hex
from stakeflow_pipeline.forecast.periods import Quarter
from stakeflow_pipeline.forecast.predictions import Prediction

pytestmark = pytest.mark.db

QUARTER = Quarter.parse("2099Q1")


def make_prediction(value: float = 371.2, second: int = 5) -> Prediction:
    return Prediction(
        group_id="aker-bp",
        quarter_start=QUARTER.start,
        predicted_at=datetime(2099, 3, 31, 21, 0, second, tzinfo=UTC),
        as_of=date(2099, 3, 31),
        data_through=date(2099, 1, 1),
        months_in_data=1,
        value_kboe_d=value,
        lo=value - 20,
        hi=value + 20,
        model_version="nowcast-test",
        kind="live",
        inputs={"group_id": "aker-bp", "quarter_start": "2099-01-01", "data_sha256": "f" * 64},
    )


@pytest.fixture
def conn(db_conn: psycopg.Connection):
    with db_conn.transaction(force_rollback=True):
        store.ensure_tables(db_conn)
        yield db_conn


def insert(conn: psycopg.Connection, prediction: Prediction) -> None:
    store.insert_rows(conn, "predictions", [prediction.db_row(run_id=None)])


def test_hashes_survive_the_database_round_trip(conn):
    original = make_prediction()
    insert(conn, original)
    with conn.cursor(row_factory=dict_row) as cur:
        row = cur.execute("select * from ml.predictions where id = %s", (original.id,)).fetchone()
    assert row is not None
    restored = Prediction.from_db(row)
    assert restored.prediction_hash == row["prediction_hash"] == original.prediction_hash
    assert restored.input_hash == row["input_hash"] == sha256_hex(original.inputs)


@pytest.mark.parametrize(
    "statement",
    [
        "update ml.predictions set value_kboe_d = 999 where id = %(id)s",
        "delete from ml.predictions where id = %(id)s",
        "truncate ml.predictions",
    ],
)
def test_predictions_are_append_only(conn, statement):
    prediction = make_prediction()
    insert(conn, prediction)
    with pytest.raises(psycopg.errors.RestrictViolation, match="append-only"):  # noqa: SIM117
        with conn.transaction():
            conn.execute(statement, {"id": prediction.id})
    assert conn.execute(
        "select value_kboe_d::float8 from ml.predictions where id = %s", (prediction.id,)
    ).fetchone() == (371.2,)


@pytest.mark.parametrize("table", store.APPEND_ONLY_TABLES)
def test_every_ml_table_rejects_truncate(conn, table):
    # Statement-level trigger, so it fires even on an empty table (CI's first run)
    with pytest.raises(psycopg.errors.RestrictViolation):  # noqa: SIM117
        with conn.transaction():
            conn.execute(f"truncate ml.{table} cascade")


def test_a_revision_is_a_new_row(conn):
    insert(conn, make_prediction(value=371.2, second=5))
    insert(conn, make_prediction(value=368.0, second=9))
    count = conn.execute(
        "select count(*) from ml.predictions where quarter_start = %s", (QUARTER.start,)
    ).fetchone()
    assert count == (2,)


def test_export_writes_verifiable_json_and_protects_frozen_files(conn, tmp_path):
    first = make_prediction()
    insert(conn, first)

    [path] = export.export_quarter(conn, QUARTER, tmp_path)
    assert path == tmp_path / "2099Q1" / "aker-bp.json"
    published = json.loads(path.read_text())
    assert path.read_text() == canonical_json(published) + "\n"
    inputs = published.pop("inputs")
    claimed = published.pop("prediction_hash")
    assert sha256_hex(inputs) == published["input_hash"]
    assert sha256_hex(published) == claimed == first.prediction_hash

    # Same prediction again: nothing to write
    assert export.export_quarter(conn, QUARTER, tmp_path) == []

    # A newer revision must not silently replace the frozen file
    insert(conn, replace(make_prediction(value=360.0, second=30), id=first.id[:-1] + "0"))
    with pytest.raises(export.ExportError, match="--force"):
        export.export_quarter(conn, QUARTER, tmp_path)
    assert export.export_quarter(conn, QUARTER, tmp_path, force=True) == [path]
    assert json.loads(path.read_text())["value_kboe_d"] == 360.0


def test_export_refuses_a_row_whose_hash_does_not_match(conn, tmp_path):
    prediction = make_prediction()
    row = prediction.db_row(run_id=None) | {"prediction_hash": "0" * 64}
    store.insert_rows(conn, "predictions", [row])
    with pytest.raises(export.ExportError, match="do not match"):
        export.export_quarter(conn, QUARTER, tmp_path)
