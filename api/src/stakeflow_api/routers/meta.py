"""Health and data freshness ("Sodir · through Aug 2026")."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.schemas import Freshness, PublicationLag

router = APIRouter(tags=["meta"])
Conn = Annotated[Connection, Depends(get_conn)]


@router.get("/health")
def health(conn: Conn) -> dict[str, str]:
    fetch_one(conn, "select 1")
    return {"status": "ok"}


@router.get("/meta/freshness", response_model=Freshness, response_model_by_alias=True)
def freshness(conn: Conn) -> Freshness:
    row = fetch_one(conn, "select latest_month, last_refresh_at from marts.meta_data_freshness")
    if row is None or row["latest_month"] is None:
        raise HTTPException(503, "no data loaded yet; run the pipeline")
    lags = fetch_all(
        conn,
        """
        select month, lag_days_min, lag_days_max, is_measured
        from marts.fct_publication_lag
        order by month desc
        limit 12
        """,
    )
    return Freshness(
        latest_month=row["latest_month"],
        last_refresh_at=row["last_refresh_at"],
        recent_publication_lags=[PublicationLag(**r) for r in lags],
    )
