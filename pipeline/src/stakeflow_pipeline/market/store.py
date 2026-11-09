"""Append-only raw storage for market data, same idea as raw_store.py for Sodir.

Each run appends what the source returned for its date window, tagged with ingestion_run_id.
Nothing is updated or deleted; staging keeps the newest value per (series, date). A run is one
transaction, and a run whose content is identical to the previous one is skipped, so a daily
schedule does not pile up copies of the same monthly file.

Runs live in their own table (raw.market_ingestion_runs) so they never count as a Sodir refresh.
The DDL is repeated in dbt/macros/external_tables.sql (dbt creates the tables when it runs on a
database where no market load has happened yet). Keep the two in sync.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import date

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from stakeflow_pipeline.market.observations import Observation, validate

RUNS_DDL = """
CREATE TABLE IF NOT EXISTS raw.market_ingestion_runs (
    run_id         uuid        PRIMARY KEY,
    source         text        NOT NULL,
    origin         text        NOT NULL,
    window_start   date,
    content_sha256 text        NOT NULL,
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    row_count      integer     NOT NULL
)
"""

TABLE_DDL = """
CREATE TABLE IF NOT EXISTS {table} (
    ingestion_run_id uuid        NOT NULL REFERENCES raw.market_ingestion_runs (run_id),
    ingested_at      timestamptz NOT NULL DEFAULT now(),
    attributes       jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS {index} ON {table} (ingestion_run_id)
"""


@dataclass(frozen=True)
class MarketTable:
    """A raw table, e.g. raw.market_eia_brent. `name` is also the Dagster asset key suffix."""

    name: str

    @property
    def identifier(self) -> sql.Identifier:
        return sql.Identifier("raw", self.name)


EIA_BRENT = MarketTable("market_eia_brent")
ECB_FX = MarketTable("market_ecb_fx")
PINK_SHEET = MarketTable("market_worldbank_pink_sheet")
SHARE_PRICES = MarketTable("market_share_prices")
MARKET_TABLES = (EIA_BRENT, ECB_FX, PINK_SHEET, SHARE_PRICES)


@dataclass(frozen=True)
class MarketRun:
    run_id: uuid.UUID | None  # None = skipped, content unchanged since the last run
    source: str
    row_count: int


def ensure_tables(conn: psycopg.Connection, table: MarketTable) -> None:
    conn.execute(RUNS_DDL)
    conn.execute(
        sql.SQL(TABLE_DDL).format(
            table=table.identifier, index=sql.Identifier(f"{table.name}_run_idx")
        )
    )


def has_finished_run(conn: psycopg.Connection, source: str) -> bool:
    """Whether this source loaded before (then a short look-back window is enough)."""
    with conn.transaction():
        conn.execute(RUNS_DDL)
        row = conn.execute(
            "SELECT 1 FROM raw.market_ingestion_runs"
            " WHERE source = %s AND finished_at IS NOT NULL LIMIT 1",
            (source,),
        ).fetchone()
    return row is not None


def content_hash(observations: list[Observation]) -> str:
    rows = sorted(json.dumps(o.to_attributes(), sort_keys=True) for o in observations)
    return hashlib.sha256("\n".join(rows).encode()).hexdigest()


def write_observations(
    conn: psycopg.Connection,
    table: MarketTable,
    source: str,
    observations: list[Observation],
    origin: str,
    window_start: date | None,
) -> MarketRun:
    """Store one run. `source` names the run ("eia_brent", "share_prices:EQNR", ...)."""
    validate(observations, source)
    digest = content_hash(observations)
    with conn.transaction():
        ensure_tables(conn, table)
        latest = conn.execute(
            "SELECT content_sha256 FROM raw.market_ingestion_runs"
            " WHERE source = %s AND finished_at IS NOT NULL"
            " ORDER BY finished_at DESC LIMIT 1",
            (source,),
        ).fetchone()
        if latest is not None and latest[0] == digest:
            return MarketRun(run_id=None, source=source, row_count=0)

        run_id = uuid.uuid4()
        conn.execute(
            "INSERT INTO raw.market_ingestion_runs"
            " (run_id, source, origin, window_start, content_sha256, row_count)"
            " VALUES (%s, %s, %s, %s, %s, 0)",
            (run_id, source, origin, window_start, digest),
        )
        with (
            conn.cursor() as cur,
            cur.copy(
                sql.SQL("COPY {table} (ingestion_run_id, attributes) FROM STDIN").format(
                    table=table.identifier
                )
            ) as copy,
        ):
            for obs in observations:
                copy.write_row((run_id, Jsonb(obs.to_attributes())))
        conn.execute(
            "UPDATE raw.market_ingestion_runs SET row_count = %s, finished_at = clock_timestamp()"
            " WHERE run_id = %s",
            (len(observations), run_id),
        )
    return MarketRun(run_id=run_id, source=source, row_count=len(observations))
