"""HTTP caching for the data endpoints.

The marts only change when the pipeline refreshes them (monthly, when Sodir publishes), so every
successful data response is cacheable for a few minutes and carries a weak ETag derived from the
warehouse freshness. A client that already holds the current data gets a bodyless 304.
"""

import hashlib
import uuid
from typing import Annotated

from fastapi import Depends, Request, Response
from psycopg import Connection
from starlette.middleware.base import RequestResponseEndpoint

from stakeflow_api.db import fetch_one, get_conn

# Fresh for 5 minutes; for the next hour a cache may serve it while it revalidates
CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600"

# Part of every ETag, so a deployed API change (new fields, different maths) is never answered
# with a 304 that keeps the old body until the next data refresh. One uvicorn process, one id.
_PROCESS_ID = uuid.uuid4().hex


def make_etag(*parts: object) -> str:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:20]
    return f'W/"{digest}"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """If-None-Match uses the weak comparison (RFC 9110 13.1.2): W/ is ignored, * matches all."""
    if not if_none_match:
        return False
    if if_none_match.strip() == "*":
        return True
    wanted = etag.removeprefix("W/")
    return any(tag.strip().removeprefix("W/") == wanted for tag in if_none_match.split(","))


def data_cache_headers(response: Response, conn: Annotated[Connection, Depends(get_conn)]) -> None:
    """Route dependency. FastAPI only copies these headers onto successful responses, so a 404
    or 422 is never cached or given an ETag."""
    row = fetch_one(conn, "select latest_month, last_refresh_at from marts.meta_data_freshness")
    if row is None:
        return
    response.headers["Cache-Control"] = CACHE_CONTROL
    response.headers["ETag"] = make_etag(row["latest_month"], row["last_refresh_at"], _PROCESS_ID)


async def not_modified(request: Request, call_next: RequestResponseEndpoint) -> Response:
    """HTTP middleware: a 200 whose ETag the client already holds becomes a bodyless 304.

    The endpoint still runs (the check needs its ETag), but the body is not sent again."""
    response = await call_next(request)
    etag = response.headers.get("etag")
    if (
        request.method == "GET"
        and response.status_code == 200
        and etag
        and etag_matches(request.headers.get("if-none-match"), etag)
    ):
        # RFC 9110 15.4.5: repeat the validators and caching headers the 200 would have sent
        kept = {k: v for k, v in response.headers.items() if k in {"etag", "cache-control", "vary"}}
        return Response(status_code=304, headers=kept)
    return response
