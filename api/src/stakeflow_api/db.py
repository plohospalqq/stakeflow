"""Connection pool and tiny query helpers. The API only reads from the `marts` schema."""

import os
from collections.abc import Iterator
from typing import Any

from fastapi import Request
from psycopg import Connection
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def conninfo_from_env() -> str:
    return make_conninfo(
        host=os.environ["POSTGRES_HOST"],
        port=os.environ["POSTGRES_PORT"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"],
    )


def make_pool() -> ConnectionPool:
    return ConnectionPool(
        conninfo_from_env(),
        min_size=1,
        max_size=10,
        # Read-only by construction: a bug in a query cannot change the warehouse
        kwargs={"options": "-c default_transaction_read_only=on"},
        open=True,
    )


def get_conn(request: Request) -> Iterator[Connection]:
    pool: ConnectionPool = request.app.state.pool
    with pool.connection() as conn:
        yield conn


def fetch_all(conn: Connection, query: str, params: dict[str, Any] | None = None) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        return cur.execute(query, params or {}).fetchall()  # type: ignore[arg-type]


def fetch_one(conn: Connection, query: str, params: dict[str, Any] | None = None) -> dict | None:
    with conn.cursor(row_factory=dict_row) as cur:
        return cur.execute(query, params or {}).fetchone()  # type: ignore[arg-type]
