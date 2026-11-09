"""Dependencies shared by the LLM endpoints. Tests override them with fakes."""

from time import monotonic
from typing import Any

import psycopg
from fastapi import HTTPException, Request
from psycopg_pool import ConnectionPool

from stakeflow_api.ask.catalog import Catalog, load_catalog
from stakeflow_api.ask.executor import (
    ReaderNotConfigured,
    ReadOnlyExecutor,
    reader_conninfo_from_env,
)
from stakeflow_api.ask.service import AskContext
from stakeflow_api.db import fetch_one
from stakeflow_api.llm import LLMNotConfigured, MessagesClient, make_client

CATALOG_TTL_SECONDS = 600


def unavailable(code: str, message: str) -> HTTPException:
    """503 with a machine-readable code, so the UI can fall back to its preview."""
    return HTTPException(status_code=503, detail={"code": code, "message": message})


def get_llm(request: Request) -> MessagesClient:
    client = getattr(request.app.state, "llm_client", None)
    if client is None:
        try:
            client = make_client()
        except LLMNotConfigured as exc:
            raise unavailable("llm_not_configured", str(exc)) from exc
        request.app.state.llm_client = client
    return client


def get_query_runner() -> ReadOnlyExecutor:
    try:
        return ReadOnlyExecutor(reader_conninfo_from_env())
    except ReaderNotConfigured as exc:
        raise unavailable("reader_not_configured", str(exc)) from exc


def get_ask_context(request: Request) -> AskContext:
    pool: ConnectionPool = request.app.state.pool
    try:
        with pool.connection() as conn:
            catalog = _cached_catalog(request.app.state, conn)
            row = fetch_one(conn, "select latest_month from marts.meta_data_freshness")
    except psycopg.Error as exc:
        raise unavailable("no_data", "The marts are not available; run the pipeline.") from exc
    return AskContext(catalog=catalog, latest_month=row["latest_month"] if row else None)


def _cached_catalog(state: Any, conn: psycopg.Connection) -> Catalog:
    # The schema only changes when a new dbt model ships; re-read it now and then, not per call
    cached: tuple[float, Catalog] | None = getattr(state, "ask_catalog", None)
    if cached is None or monotonic() - cached[0] > CATALOG_TTL_SECONDS:
        cached = (monotonic(), load_catalog(conn))
        state.ask_catalog = cached
    return cached[1]
