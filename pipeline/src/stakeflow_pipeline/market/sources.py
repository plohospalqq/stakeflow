"""Public price sources: parsers (pure, tested on recorded responses) and thin fetchers.

| Source | Series | Licence (docs/market-data-sources.md) |
|---|---|---|
| EIA API v2 | Brent spot FOB, daily, USD/bbl | US public domain, cite EIA |
| ECB Data Portal | EUR/USD, EUR/NOK reference rates, daily | free reuse, cite, unmodified |
| World Bank Pink Sheet | Natural gas Europe (TTF), Brent, monthly, USD | CC BY 4.0 |

Retries are left to the Dagster RetryPolicy, as for Sodir.
"""

import csv
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from typing import Any

import httpx
from pydantic import BaseModel, field_validator

from stakeflow_pipeline.market.observations import MarketDataError, Observation

# --- EIA: Brent spot price -------------------------------------------------------------------

EIA_BASE_URL = "https://api.eia.gov/v2"
EIA_BRENT_SERIES = "RBRTE"
EIA_PAGE_SIZE = 5000  # the API's maximum for JSON


class _EiaRow(BaseModel):
    period: date
    series: str
    value: float | None
    units: str

    @field_validator("value", mode="before")
    @classmethod
    def _missing_is_none(cls, value: Any) -> Any:
        # EIA marks holidays and gaps with null or "NA"
        return None if value in (None, "", "NA") else value


class _EiaData(BaseModel):
    total: int
    data: list[_EiaRow]


class _EiaResponse(BaseModel):
    response: _EiaData


def parse_eia_page(payload: dict[str, Any]) -> tuple[list[Observation], int]:
    """One EIA API page → (observations, total rows the query matches)."""
    if "error" in payload:
        raise MarketDataError(f"EIA: {payload['error']}")
    page = _EiaResponse.model_validate(payload).response
    observations = [
        Observation(row.series, row.period, row.value, row.units)
        for row in page.data
        if row.value is not None
    ]
    return observations, page.total


def fetch_eia_brent(http: httpx.Client, api_key: str, start: date) -> list[Observation]:
    # The key goes in a header (api.data.gov accepts X-Api-Key), so it never appears in a URL
    # that could end up in a log line
    headers = {"X-Api-Key": api_key}
    params: dict[str, str | int] = {
        "frequency": "daily",
        "data[0]": "value",
        "facets[series][]": EIA_BRENT_SERIES,
        "start": start.isoformat(),
        "sort[0][column]": "period",
        "sort[0][direction]": "asc",
        "length": EIA_PAGE_SIZE,
    }
    observations: list[Observation] = []
    offset = 0
    while True:
        response = http.get(
            f"{EIA_BASE_URL}/petroleum/pri/spt/data/",
            params={**params, "offset": offset},
            headers=headers,
        )
        _raise_for_status(response, "EIA")
        page, total = parse_eia_page(response.json())
        observations.extend(page)
        offset += EIA_PAGE_SIZE
        if offset >= total:
            return observations


# --- ECB: euro reference exchange rates ------------------------------------------------------

ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+NOK.EUR.SP00.A"


def parse_ecb_csv(text: str) -> list[Observation]:
    """ECB SDMX `csvdata`: one row per currency and day. Unit is <currency> per EUR."""
    reader = csv.DictReader(io.StringIO(text))
    required = {"KEY", "CURRENCY", "TIME_PERIOD", "OBS_VALUE"}
    if not reader.fieldnames or not required <= set(reader.fieldnames):
        raise MarketDataError(f"ECB: unexpected columns {reader.fieldnames!r}")
    return [
        Observation(
            row["KEY"],
            date.fromisoformat(row["TIME_PERIOD"]),
            float(row["OBS_VALUE"]),
            f"{row['CURRENCY']} per EUR",
        )
        for row in reader
        if row["OBS_VALUE"] not in ("", "NaN")
    ]


def fetch_ecb_fx(http: httpx.Client, start: date) -> list[Observation]:
    response = http.get(ECB_URL, params={"format": "csvdata", "startPeriod": start.isoformat()})
    _raise_for_status(response, "ECB")
    if "csv" not in response.headers.get("content-type", ""):
        raise MarketDataError(f"ECB: expected CSV, got {response.text[:200]!r}")
    return parse_ecb_csv(response.text)


# --- World Bank: Commodity Price Data (the Pink Sheet), monthly ------------------------------

PINK_SHEET_PAGE = "https://www.worldbank.org/en/research/commodity-markets"
# The workbook URL changes with every monthly release, so it is read from the page each time
PINK_SHEET_LINK = re.compile(
    r"https://thedocs\.worldbank\.org/en/doc/[0-9a-f]+-\d+/related/CMO-Historical-Data-Monthly\.xlsx"
)
PINK_SHEET_SERIES = ("Natural gas, Europe", "Crude oil, Brent")
PINK_SHEET_NAME = "Monthly Prices"
MAX_XLSX_BYTES = 20_000_000
MAX_SHEET_XML_BYTES = 60_000_000  # the real sheet is ~2.4 MB; guards against a zip bomb

_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
_MONTH = re.compile(r"^(\d{4})M(\d{2})$")


def find_pink_sheet_url(html: str) -> str:
    match = PINK_SHEET_LINK.search(html)
    if match is None:
        raise MarketDataError("World Bank: monthly workbook link not found on the page")
    return match.group(0)


def parse_pink_sheet(xlsx: bytes) -> list[Observation]:
    """Monthly prices for PINK_SHEET_SERIES from the CMO historical workbook.

    Read with the standard library (an xlsx is zipped XML) to avoid a spreadsheet dependency.
    Python's expat neither resolves external entities nor expands entity bombs (expat >= 2.4).
    """
    with zipfile.ZipFile(io.BytesIO(xlsx)) as book:
        rows = _sheet_rows(book, PINK_SHEET_NAME)

    header_index = next(
        (i for i, row in enumerate(rows) if PINK_SHEET_SERIES[0] in row.values()), None
    )
    if header_index is None:
        raise MarketDataError(f"World Bank: no {PINK_SHEET_SERIES[0]!r} column")
    header, units = rows[header_index], rows[header_index + 1]
    columns = {name.strip(): col for col, name in header.items()}

    observations: list[Observation] = []
    for series in PINK_SHEET_SERIES:
        col = columns.get(series)
        if col is None:
            raise MarketDataError(f"World Bank: no {series!r} column")
        unit = units.get(col, "").strip("() ")
        for row in rows[header_index + 2 :]:
            month = _MONTH.match(row.get("A", ""))
            value = _to_float(row.get(col))
            if month and value is not None:
                day = date(int(month.group(1)), int(month.group(2)), 1)
                observations.append(Observation(series, day, value, unit))
    return observations


def fetch_pink_sheet(http: httpx.Client) -> tuple[list[Observation], str]:
    page = http.get(PINK_SHEET_PAGE)
    _raise_for_status(page, "World Bank")
    url = find_pink_sheet_url(page.text)
    workbook = http.get(url)
    _raise_for_status(workbook, "World Bank")
    if len(workbook.content) > MAX_XLSX_BYTES:
        raise MarketDataError(f"World Bank: workbook too large ({len(workbook.content)} bytes)")
    return parse_pink_sheet(workbook.content), url


def _sheet_rows(book: zipfile.ZipFile, sheet_name: str) -> list[dict[str, str]]:
    """Rows of one worksheet as {column letter: text}, shared strings resolved."""
    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    sheet = next(
        (s for s in workbook.iter(f"{{{_NS['m']}}}sheet") if s.get("name") == sheet_name), None
    )
    if sheet is None:
        raise MarketDataError(f"World Bank: no sheet {sheet_name!r}")
    rel_id = sheet.get(f"{{{_NS['r']}}}id")
    rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == rel_id)
    path = "xl/" + str(target).removeprefix("/xl/")
    if book.getinfo(path).file_size > MAX_SHEET_XML_BYTES:
        raise MarketDataError(f"World Bank: sheet {sheet_name!r} is implausibly large")

    strings: list[str] = []
    if "xl/sharedStrings.xml" in book.namelist():
        sst = ET.fromstring(book.read("xl/sharedStrings.xml"))
        strings = ["".join(t.text or "" for t in si.iter(f"{{{_NS['m']}}}t")) for si in sst]

    rows: list[dict[str, str]] = []
    for row in ET.fromstring(book.read(path)).iter(f"{{{_NS['m']}}}row"):
        cells: dict[str, str] = {}
        for cell in row.iter(f"{{{_NS['m']}}}c"):
            column = re.sub(r"\d", "", cell.get("r", ""))
            kind = cell.get("t")
            if kind == "inlineStr":
                cells[column] = "".join(t.text or "" for t in cell.iter(f"{{{_NS['m']}}}t"))
                continue
            raw = cell.findtext(f"{{{_NS['m']}}}v")
            if raw is not None:
                cells[column] = strings[int(raw)] if kind == "s" else raw
        rows.append(cells)
    return rows


def _to_float(text: str | None) -> float | None:
    # Missing months are "…" or "..." in the workbook
    try:
        return float(text) if text is not None else None
    except ValueError:
        return None


def _raise_for_status(response: httpx.Response, source: str) -> None:
    if response.is_error:
        raise MarketDataError(f"{source}: HTTP {response.status_code}: {response.text[:200]!r}")
