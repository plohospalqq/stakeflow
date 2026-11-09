"""Run validated SQL as the read-only `stakeflow_reader` role, with a timeout and a row cap.

One short-lived connection per query instead of a pool: /ask waits seconds on the model anyway,
and a fresh session means nothing one query does (a lock, a setting) can leak into the next.
"""

import math
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from time import perf_counter
from typing import Any

import psycopg
from psycopg import errors
from psycopg.conninfo import make_conninfo

MAX_ROWS = 500
STATEMENT_TIMEOUT_MS = 3_000
MAX_CELL_CHARS = 300

Cell = str | int | float | None


class ReaderNotConfigured(RuntimeError):
    """No password for the reader role, so model-written SQL has nowhere safe to run."""


class QueryFailed(RuntimeError):
    """Postgres refused or failed the query. The message is safe to show to the model."""


class QueryTimedOut(QueryFailed):
    pass


@dataclass(frozen=True)
class QueryResult:
    columns: list[str]
    rows: list[list[Cell]]
    duration_ms: int
    truncated: bool  # the row cap was reached; there may be more rows


def reader_conninfo_from_env() -> str:
    password = os.environ.get("STAKEFLOW_READER_PASSWORD", "")
    if not password:
        raise ReaderNotConfigured(
            "STAKEFLOW_READER_PASSWORD is not set; create the role with "
            "infra/postgres/init/03-reader-role.sh"
        )
    return make_conninfo(
        host=os.environ["POSTGRES_HOST"],
        port=os.environ["POSTGRES_PORT"],
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ.get("STAKEFLOW_READER_USER", "stakeflow_reader"),
        password=password,
        connect_timeout=5,
        application_name="stakeflow-ask",
        # Same limits as the role's defaults: whichever is configured, both hold
        options=(
            f"-c default_transaction_read_only=on -c statement_timeout={STATEMENT_TIMEOUT_MS} "
            "-c search_path=marts,ml"
        ),
    )


class ReadOnlyExecutor:
    def __init__(self, conninfo: str) -> None:
        self._conninfo = conninfo

    def __call__(self, sql: str) -> QueryResult:
        """Run already validated SQL (see sql_guard.validate_sql), capped at MAX_ROWS rows."""
        wrapped = f"SELECT * FROM (\n{sql}\n) AS ask_result LIMIT {MAX_ROWS}"
        try:
            with psycopg.connect(self._conninfo) as conn:
                started = perf_counter()
                cursor = conn.execute(wrapped)  # type: ignore[arg-type]  # validated, not user text
                rows = cursor.fetchall()
                duration_ms = round((perf_counter() - started) * 1000)
                columns = [column.name for column in cursor.description or []]
                conn.rollback()
        except errors.QueryCanceled as exc:
            raise QueryTimedOut(
                f"The query took longer than {STATEMENT_TIMEOUT_MS // 1000} s and was stopped. "
                "Make it cheaper: filter by month or field before joining, aggregate earlier."
            ) from exc
        except psycopg.OperationalError:
            # Connection-level trouble (role missing, wrong password, DB down) is not the
            # model's fault and must not be sent back to it as something to repair
            raise
        except psycopg.Error as exc:
            raise QueryFailed(_postgres_message(exc)) from exc

        return QueryResult(
            columns=columns,
            rows=[[to_cell(value) for value in row] for row in rows],
            duration_ms=duration_ms,
            truncated=len(rows) >= MAX_ROWS,
        )


def to_cell(value: Any) -> Cell:
    """JSON-friendly value: numbers stay numbers, dates become ISO strings."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None or isinstance(value, int):
        return value
    if isinstance(value, float | Decimal):
        if not math.isfinite(value):
            return str(value)  # NaN and infinity are not valid JSON numbers
        if isinstance(value, Decimal) and value == value.to_integral_value() and abs(value) < 2**53:
            return int(value)
        return float(value)
    if isinstance(value, date | datetime | time):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    text = str(value)
    return text if len(text) <= MAX_CELL_CHARS else text[: MAX_CELL_CHARS - 1] + "…"


def _postgres_message(exc: psycopg.Error) -> str:
    diag = exc.diag
    parts = [diag.message_primary or str(exc).splitlines()[0]]
    if diag.message_hint:
        parts.append(f"Hint: {diag.message_hint}")
    return " ".join(parts)[:500]
