"""Share prices from a CSV the user supplies. Stakeflow never downloads them itself.

No free source we found lets an app download Oslo Børs prices automatically *and* show them
(docs/market-data-sources.md). Euronext's website allows a personal download, so the user
exports the CSV from live.euronext.com (or any source they are licensed for) and this module
loads it into the local database only. The files and the data never go into git.

Two formats are accepted:
- Euronext "Historical Data" export (`;`-separated, dd/mm/yyyy, ISIN on line 3)
- a plain CSV with a `date` (ISO) and `close` column and an optional `volume` column
"""

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from stakeflow_pipeline.market.observations import MarketDataError, Observation

_ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")


@dataclass(frozen=True)
class Listing:
    group_id: str
    ticker: str
    isin: str
    currency: str


@dataclass(frozen=True)
class ShareCsv:
    format: str
    isin: str | None
    observations: list[Observation]


def load_listings(seed_path: Path) -> dict[str, Listing]:
    """Ticker → listing, from the dbt seed so SQL and Python share one mapping."""
    with seed_path.open(encoding="utf-8") as f:
        return {
            row["ticker"]: Listing(row["group_id"], row["ticker"], row["isin"], row["currency"])
            for row in csv.DictReader(f)
        }


def ticker_from_filename(path: Path) -> str:
    """'EQNR.csv', 'eqnr_2026-11-09.csv' and 'EQNR-history.csv' all mean EQNR."""
    return re.split(r"[_\-. ]", path.stem, maxsplit=1)[0].upper()


def parse_share_csv(text: str, listing: Listing, today: date) -> ShareCsv:
    text = text.lstrip("﻿")
    first = text.lstrip().split("\n", 1)[0].strip().strip('"')
    parsed = _parse_euronext(text) if first == "Historical Data" else _parse_plain(text)
    if parsed.isin is not None and parsed.isin != listing.isin:
        raise MarketDataError(
            f"{listing.ticker}: file is for ISIN {parsed.isin}, expected {listing.isin}"
        )
    future = [o.date for o in parsed.observations if o.date > today]
    if future:
        raise MarketDataError(f"{listing.ticker}: dates in the future, e.g. {future[0]}")
    return ShareCsv(
        parsed.format,
        parsed.isin,
        [
            Observation(listing.ticker, o.date, o.value, listing.currency, o.extra)
            for o in parsed.observations
        ],
    )


def _parse_euronext(text: str) -> ShareCsv:
    lines = [line.strip() for line in text.splitlines()]
    isin = next((line for line in lines[:5] if _ISIN.match(line)), None)
    header_at = next((i for i, line in enumerate(lines) if line.startswith("Date;")), None)
    if header_at is None:
        raise MarketDataError("Euronext CSV: no 'Date;' header line")
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_at:])), delimiter=";")
    observations = [
        Observation(
            "",
            datetime.strptime(row["Date"], "%d/%m/%Y").date(),
            _number(row["Close"]),
            "",
            {"volume": _volume(row.get("Number of Shares"))},
        )
        for row in reader
        if row.get("Date") and row.get("Close")
    ]
    return ShareCsv("euronext", isin, observations)


def _parse_plain(text: str) -> ShareCsv:
    dialect = csv.Sniffer().sniff(text.split("\n", 1)[0], delimiters=",;")
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    columns = {name.strip().lower(): name for name in reader.fieldnames or []}
    if "date" not in columns or "close" not in columns:
        raise MarketDataError(f"share CSV: need 'date' and 'close' columns, got {list(columns)}")
    observations = [
        Observation(
            "",
            date.fromisoformat(row[columns["date"]].strip()),
            _number(row[columns["close"]]),
            "",
            {"volume": _volume(row.get(columns.get("volume", ""), None))},
        )
        for row in reader
        if row.get(columns["date"])
    ]
    return ShareCsv("plain", None, observations)


def _number(text: str) -> float:
    # Euronext lets the user pick "," as the decimal separator
    return float(text.strip().replace(",", "."))


def _volume(text: str | None) -> int | None:
    return int(float(text)) if text and text.strip() else None
