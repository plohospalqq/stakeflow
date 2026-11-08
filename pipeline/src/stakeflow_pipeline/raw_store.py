"""Writes Sodir snapshots into the `raw` schema.

Every run appends a full snapshot tagged with `ingestion_run_id`. Nothing is updated or deleted,
so later phases can ask "what did Sodir say on date X?" (needed for honest backtests).

A run is one transaction: if paging fails or the row count does not match Sodir's own count,
nothing is written. A half snapshot would be worse than no snapshot.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from stakeflow_pipeline.sodir.client import Feature
from stakeflow_pipeline.sodir.layers import Layer

RUNS_DDL = """
CREATE TABLE IF NOT EXISTS raw.ingestion_runs (
    run_id         uuid PRIMARY KEY,
    layer          text        NOT NULL,
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    row_count      integer     NOT NULL,
    expected_count integer     NOT NULL
)
"""

LAYER_DDL = """
CREATE TABLE IF NOT EXISTS {table} (
    ingestion_run_id uuid        NOT NULL REFERENCES raw.ingestion_runs (run_id),
    ingested_at      timestamptz NOT NULL DEFAULT now(),
    attributes       jsonb       NOT NULL,
    geometry         jsonb
);
CREATE INDEX IF NOT EXISTS {index} ON {table} (ingestion_run_id)
"""


class RowCountMismatch(RuntimeError):
    pass


@dataclass(frozen=True)
class RunResult:
    run_id: uuid.UUID
    layer: str
    row_count: int


def raw_table(layer: Layer) -> sql.Composed:
    return sql.Identifier("raw", f"sodir_{layer.name}")


def ensure_tables(conn: psycopg.Connection, layer: Layer) -> None:
    conn.execute(RUNS_DDL)
    conn.execute(
        sql.SQL(LAYER_DDL).format(
            table=raw_table(layer),
            index=sql.Identifier(f"sodir_{layer.name}_run_idx"),
        )
    )


def write_snapshot(
    conn: psycopg.Connection,
    layer: Layer,
    pages: Iterable[list[Feature]],
    expected_count: int,
) -> RunResult:
    run_id = uuid.uuid4()
    with conn.transaction():
        ensure_tables(conn, layer)
        # Run row first so the foreign key holds; row_count and finished_at are set at the end
        conn.execute(
            "INSERT INTO raw.ingestion_runs (run_id, layer, row_count, expected_count)"
            " VALUES (%s, %s, 0, %s)",
            (run_id, layer.name, expected_count),
        )
        row_count = 0
        with conn.cursor() as cur:
            copy_sql = sql.SQL(
                "COPY {table} (ingestion_run_id, attributes, geometry) FROM STDIN"
            ).format(table=raw_table(layer))
            with cur.copy(copy_sql) as copy:
                for page in pages:
                    for feature in page:
                        geometry = Jsonb(feature.geometry) if feature.geometry else None
                        copy.write_row((run_id, Jsonb(feature.properties), geometry))
                        row_count += 1

        if row_count != expected_count:
            raise RowCountMismatch(
                f"{layer.name}: got {row_count} rows, Sodir reports {expected_count}"
            )
        conn.execute(
            "UPDATE raw.ingestion_runs SET row_count = %s, finished_at = clock_timestamp()"
            " WHERE run_id = %s",
            (row_count, run_id),
        )
        # Fresh statistics so the first dbt run after a load gets sane query plans
        conn.execute(sql.SQL("ANALYZE {table}").format(table=raw_table(layer)))
    return RunResult(run_id=run_id, layer=layer.name, row_count=row_count)
