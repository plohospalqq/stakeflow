"""Share prices from a CSV the user supplies. Stakeflow never downloads them itself.

No free source we found lets an app download Oslo Børs prices automatically *and* show them
(docs/market-data-sources.md). Euronext's website allows a personal download, so the user
exports the CSV from live.euronext.com (or any source they are licensed for) and this module
loads it into the local database only. The files and the data never go into git.

Three formats are accepted:
- Euronext "Historical Data" export as .xls (the only download that covers the full two years)
- the same export as CSV (`;`-separated, dd/mm/yyyy, ISIN on line 3)
- a plain CSV with a `date` (ISO) and `close` column and an optional `volume` column

Euronext files carry the ISIN, so they are matched to a company by ISIN and can keep the name
Euronext gives them ("EQUINOR_historical_price.xls"). Plain CSVs are matched by file name.
"""

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import xlrd

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


def read_share_file(path: Path) -> ShareCsv:
    """Parse a user-supplied file without deciding yet which company it belongs to."""
    if path.suffix.lower() == ".xls":
        return _parse_euronext_xls(path.read_bytes())
    return _parse_text(path.read_text(encoding="utf-8-sig"))


def resolve_listing(path: Path, parsed: ShareCsv, listings: dict[str, Listing]) -> Listing:
    """By ISIN when the file has one (Euronext exports), otherwise by file name.

    A file named after one company but holding another company's ISIN is rejected: that is a
    mix-up, not something to guess around.
    """
    named = listings.get(ticker_from_filename(path))
    if parsed.isin is None:
        if named is None:
            raise MarketDataError(
                f"{path.name}: unknown ticker; name the file after one of {list(listings)}"
            )
        return named
    by_isin = {listing.isin: listing for listing in listings.values()}
    listing = by_isin.get(parsed.isin)
    if listing is None:
        raise MarketDataError(f"{path.name}: ISIN {parsed.isin} is not one of the listed companies")
    if named is not None and named is not listing:
        raise MarketDataError(
            f"{path.name}: named {named.ticker} but holds {listing.ticker}'s ISIN {parsed.isin}"
        )
    return listing


def parse_share_csv(text: str, listing: Listing, today: date) -> ShareCsv:
    return finalise(_parse_text(text), listing, today)


def finalise(parsed: ShareCsv, listing: Listing, today: date) -> ShareCsv:
    """Check the parsed file against its listing and stamp the ticker and currency on it."""
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


def _parse_text(text: str) -> ShareCsv:
    text = text.lstrip("\ufeff")
    first = text.lstrip().split("\n", 1)[0].strip().strip('"')
    return _parse_euronext(text) if first == "Historical Data" else _parse_plain(text)


def _parse_euronext_xls(data: bytes) -> ShareCsv:
    # Euronext's generator writes a compound file that xlrd's strict structure check rejects
    # ("Workbook corruption: seen[2] == 4"); the worksheet stream itself reads fine.
    book = xlrd.open_workbook(file_contents=data, ignore_workbook_corruption=True)
    sheet = book.sheet_by_index(0)
    first_column = [str(sheet.cell_value(r, 0)).strip() for r in range(sheet.nrows)]
    isin = next((v for v in first_column[:5] if _ISIN.match(v)), None)
    header_at = next((r for r, v in enumerate(first_column) if v == "Date"), None)
    if header_at is None:
        raise MarketDataError("Euronext .xls: no 'Date' header row")
    header = [str(v).strip() for v in sheet.row_values(header_at)]
    if "Close" not in header:
        raise MarketDataError(f"Euronext .xls: no 'Close' column in {header}")
    i_close = header.index("Close")
    i_volume = header.index("Number of Shares") if "Number of Shares" in header else None
    observations = []
    for r in range(header_at + 1, sheet.nrows):
        raw_date, close = sheet.cell_value(r, 0), sheet.cell_value(r, i_close)
        if raw_date in ("", None) or close in ("", None):
            continue
        volume = sheet.cell_value(r, i_volume) if i_volume is not None else None
        observations.append(
            Observation(
                "",
                _xls_date(raw_date, book.datemode),
                close if isinstance(close, float) else _number(str(close)),
                "",
                {"volume": int(volume) if isinstance(volume, float) else _volume(volume)},
            )
        )
    return ShareCsv("euronext-xls", isin, observations)


def _xls_date(value: object, datemode: int) -> date:
    if isinstance(value, float):
        return xlrd.xldate_as_datetime(value, datemode).date()
    return datetime.strptime(str(value).strip(), "%d/%m/%Y").date()


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
