"""Market prices for context: Brent, TTF, EUR/USD and USD/NOK, with source and licence.

There is no /prices/forward: no free source with display rights publishes Brent or TTF
forward curves, so /prices/latest gives the newest spot values instead (and says so).
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.schemas import LatestPrices, PricePoint, PriceSeries, PriceSeriesId

router = APIRouter(prefix="/prices", tags=["prices"])
Conn = Annotated[Connection, Depends(get_conn)]

DEFAULT_DAYS = 365


@router.get("", response_model=list[PriceSeries], response_model_by_alias=True)
def list_prices(
    conn: Conn,
    series: Annotated[
        list[PriceSeriesId] | None, Query(description="Series ids (default: all)")
    ] = None,
    start: Annotated[date | None, Query(description="First date (default: a year back)")] = None,
    end: Annotated[date | None, Query(description="Last date (default: newest)")] = None,
) -> list[PriceSeries]:
    """Each series at its native frequency: daily (Brent, FX) or monthly (TTF, dated the 1st)."""
    if start and end and start > end:
        raise HTTPException(422, "start must not be after end")
    catalogue = fetch_all(
        conn,
        """
        select series_id, name, unit, frequency, source, source_url, licence, attribution
        from marts.price_series
        where %(ids)s::text[] is null or series_id = any(%(ids)s)
        order by series_id
        """,
        {"ids": series},
    )
    newest = fetch_one(conn, "select max(date) as d from marts.fct_prices")
    last = end or (newest["d"] if newest and newest["d"] else date.today())
    first = start or last - timedelta(days=DEFAULT_DAYS)
    points = fetch_all(
        conn,
        """
        select series_id, date, value::float8 as value
        from marts.fct_prices
        where series_id = any(%(ids)s) and date between %(first)s and %(last)s
        order by series_id, date
        """,
        {"ids": [c["series_id"] for c in catalogue], "first": first, "last": last},
    )
    by_series: dict[str, list[PricePoint]] = {}
    for p in points:
        by_series.setdefault(p["series_id"], []).append(
            PricePoint(date=p["date"], value=p["value"])
        )
    return [
        PriceSeries(
            id=c["series_id"],
            name=c["name"],
            unit=c["unit"],
            frequency=c["frequency"],
            source=c["source"],
            source_url=c["source_url"],
            licence=c["licence"],
            attribution=c["attribution"],
            points=by_series.get(c["series_id"], []),
        )
        for c in catalogue
    ]


@router.get("/latest", response_model=LatestPrices, response_model_by_alias=True)
def latest_prices(conn: Conn) -> LatestPrices:
    """Newest value of each series (spot, not forward). TTF is the latest monthly average."""
    rows = fetch_all(
        conn,
        """
        select distinct on (series_id) series_id, date, value::float8 as value
        from marts.fct_prices
        order by series_id, date desc
        """,
    )
    if not rows:
        raise HTTPException(503, "no prices loaded yet; run the market_refresh job")
    latest = {r["series_id"]: r for r in rows}

    def value(series_id: str) -> float | None:
        return latest[series_id]["value"] if series_id in latest else None

    def when(series_id: str) -> date | None:
        return latest[series_id]["date"] if series_id in latest else None

    return LatestPrices(
        as_of=max(r["date"] for r in rows),
        brent_usd_per_bbl=value("brent"),
        brent_date=when("brent"),
        ttf_eur_per_mwh=value("ttf"),
        ttf_month=when("ttf"),
        eur_usd=value("eurusd"),
        eur_usd_date=when("eurusd"),
        usd_nok=value("usdnok"),
        usd_nok_date=when("usdnok"),
    )
