"""Month-range query parameters shared by every time-series endpoint."""

from dataclasses import dataclass
from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.db import fetch_one, get_conn

DEFAULT_MONTHS = 36


@dataclass(frozen=True)
class MonthRange:
    start: date
    end: date


def month_range(
    conn: Annotated[Connection, Depends(get_conn)],
    start: Annotated[
        date | None, Query(description="First month (default: 36 months back)")
    ] = None,
    end: Annotated[date | None, Query(description="Last month (default: newest in data)")] = None,
) -> MonthRange:
    row = fetch_one(conn, "select latest_month from marts.meta_data_freshness")
    latest: date = row["latest_month"] if row else date.today()
    end_month = (end or latest).replace(day=1)
    if start is None:
        total = end_month.year * 12 + end_month.month - 1 - (DEFAULT_MONTHS - 1)
        start_month = date(total // 12, total % 12 + 1, 1)
    else:
        start_month = start.replace(day=1)
    if start_month > end_month:
        raise HTTPException(422, "start must not be after end")
    return MonthRange(start=start_month, end=end_month)
