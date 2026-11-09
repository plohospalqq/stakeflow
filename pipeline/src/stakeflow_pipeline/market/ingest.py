"""Load market data into raw.market_*: public price sources and user-supplied share CSVs.

    stakeflow-market                          # all public sources (EIA, ECB, World Bank)
    stakeflow-market ecb_fx                   # one source
    stakeflow-import-share-prices data/share_prices/EQNR.csv
    stakeflow-import-share-prices data/share_prices        # every *.csv in a directory

Dagster calls the same functions; the CLIs are for manual runs and debugging.
"""

import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import httpx
import psycopg

from stakeflow_pipeline.market.observations import Observation
from stakeflow_pipeline.market.share_prices import (
    Listing,
    finalise,
    load_listings,
    read_share_file,
    resolve_listing,
)
from stakeflow_pipeline.market.sources import (
    ECB_URL,
    EIA_BASE_URL,
    fetch_ecb_fx,
    fetch_eia_brent,
    fetch_pink_sheet,
)
from stakeflow_pipeline.market.store import (
    ECB_FX,
    EIA_BRENT,
    PINK_SHEET,
    SHARE_PRICES,
    MarketRun,
    MarketTable,
    has_finished_run,
    write_observations,
)
from stakeflow_pipeline.settings import (
    DBT_PROJECT_DIR,
    database_conninfo,
    eia_api_key,
    share_prices_dir,
)

USER_AGENT = "stakeflow/0.1 (+https://github.com/plohospalqq/stakeflow)"
HISTORY_START = date(2010, 1, 1)
LISTINGS_SEED = DBT_PROJECT_DIR / "seeds" / "share_listings.csv"

Fetch = Callable[[httpx.Client, date], tuple[list[Observation], str]]


def _eia(http: httpx.Client, start: date) -> tuple[list[Observation], str]:
    return fetch_eia_brent(http, eia_api_key(), start), f"{EIA_BASE_URL}/petroleum/pri/spt"


def _ecb(http: httpx.Client, start: date) -> tuple[list[Observation], str]:
    return fetch_ecb_fx(http, start), ECB_URL


def _pink_sheet(http: httpx.Client, start: date) -> tuple[list[Observation], str]:
    # One workbook with the full history; the window only limits what gets stored
    return fetch_pink_sheet(http)


@dataclass(frozen=True)
class PublicSource:
    name: str
    table: MarketTable
    fetch: Fetch
    # After the first full load, re-read this far back: catches late revisions cheaply
    lookback_days: int


PUBLIC_SOURCES: tuple[PublicSource, ...] = (
    PublicSource("eia_brent", EIA_BRENT, _eia, lookback_days=120),
    PublicSource("ecb_fx", ECB_FX, _ecb, lookback_days=120),
    # Monthly, revised now and then; two years back is cheap (it is one download anyway)
    PublicSource("worldbank_pink_sheet", PINK_SHEET, _pink_sheet, lookback_days=730),
)
PUBLIC_SOURCES_BY_NAME = {s.name: s for s in PUBLIC_SOURCES}


def make_http_client(timeout_s: float = 60.0) -> httpx.Client:
    return httpx.Client(
        timeout=timeout_s, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    )


def ingest_public_source(
    conn: psycopg.Connection, http: httpx.Client, source: PublicSource, today: date
) -> MarketRun:
    first_load = not has_finished_run(conn, source.name)
    start = HISTORY_START if first_load else today - timedelta(days=source.lookback_days)
    observations, origin = source.fetch(http, start)
    in_window = [o for o in observations if o.date >= start]
    return write_observations(conn, source.table, source.name, in_window, origin, start)


def import_share_file(
    conn: psycopg.Connection, path: Path, listings: dict[str, Listing], today: date
) -> MarketRun:
    raw = read_share_file(path)
    listing = resolve_listing(path, raw, listings)
    parsed = finalise(raw, listing, today)
    return write_observations(
        conn,
        SHARE_PRICES,
        f"share_prices:{listing.ticker}",
        parsed.observations,
        f"{parsed.format}:{path.name}",
        min(o.date for o in parsed.observations) if parsed.observations else None,
    )


SHARE_FILE_SUFFIXES = (".csv", ".xls")


def share_price_files(target: Path) -> list[Path]:
    if target.is_dir():
        return sorted(p for p in target.iterdir() if p.suffix.lower() in SHARE_FILE_SUFFIXES)
    return [target] if target.exists() else []


def _print_run(run: MarketRun) -> None:
    status = f"{run.row_count:>6} rows  run={run.run_id}" if run.run_id else "unchanged, skipped"
    print(f"{run.source:<28} {status}")


def main(argv: list[str] | None = None) -> int:
    names = sys.argv[1:] if argv is None else argv
    unknown = [n for n in names if n not in PUBLIC_SOURCES_BY_NAME]
    if unknown:
        print(f"unknown sources: {unknown}. Known: {list(PUBLIC_SOURCES_BY_NAME)}", file=sys.stderr)
        return 2
    sources = [PUBLIC_SOURCES_BY_NAME[n] for n in names] if names else list(PUBLIC_SOURCES)
    with make_http_client() as http, psycopg.connect(database_conninfo()) as conn:
        for source in sources:
            _print_run(ingest_public_source(conn, http, source, date.today()))
    return 0


def import_main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    targets = [Path(a) for a in args] or [share_prices_dir()]
    files = [f for t in targets for f in share_price_files(t)]
    if not files:
        print(f"no CSV files found in {[str(t) for t in targets]}", file=sys.stderr)
        return 2
    listings = load_listings(LISTINGS_SEED)
    with psycopg.connect(database_conninfo()) as conn:
        for path in files:
            _print_run(import_share_file(conn, path, listings, date.today()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
