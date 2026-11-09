"""Market data parsers and fetchers on recorded responses (no network).

Fixtures: EIA and ECB responses recorded 2026-11-09 (public domain / ECB statistics, cited in
docs/market-data-sources.md); a trimmed copy of the World Bank CMO monthly workbook (CC BY 4.0,
four columns, last 14 months); a made-up share price CSV in Euronext's export format.
"""

import io
import json
import zipfile
from datetime import date
from pathlib import Path

import httpx
import pytest

from stakeflow_pipeline.market.observations import MarketDataError, Observation, validate
from stakeflow_pipeline.market.share_prices import (
    Listing,
    load_listings,
    parse_share_csv,
    ticker_from_filename,
)
from stakeflow_pipeline.market.sources import (
    fetch_ecb_fx,
    fetch_eia_brent,
    find_pink_sheet_url,
    parse_ecb_csv,
    parse_eia_page,
    parse_pink_sheet,
)
from stakeflow_pipeline.settings import DBT_PROJECT_DIR

FIXTURES = Path(__file__).parent / "fixtures" / "market"
AKRBP = Listing("aker-bp", "AKRBP", "NO0010345853", "NOK")
TODAY = date(2026, 11, 9)


def http_with(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


# --- EIA ------------------------------------------------------------------------------------


def test_eia_page_parses_brent_in_usd_per_barrel():
    payload = json.loads((FIXTURES / "eia_brent_page.json").read_text())
    observations, total = parse_eia_page(payload)

    assert total == 11 == len(observations)
    first = observations[0]
    assert (first.series, first.date, first.value, first.unit) == (
        "RBRTE",
        date(2026, 10, 20),
        115.22,
        "$/BBL",
    )


def test_eia_holidays_without_a_value_are_dropped():
    payload = {
        "response": {
            "total": "2",
            "data": [
                {"period": "2026-12-25", "series": "RBRTE", "value": None, "units": "$/BBL"},
                {"period": "2026-12-28", "series": "RBRTE", "value": "NA", "units": "$/BBL"},
            ],
        }
    }
    assert parse_eia_page(payload) == ([], 2)


def test_eia_key_goes_in_a_header_and_pages_are_followed():
    payload = json.loads((FIXTURES / "eia_brent_page.json").read_text())
    payload["response"]["total"] = "5011"  # pretend there is a second page
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=payload)

    observations = fetch_eia_brent(http_with(handler), "secret-key", date(2026, 10, 20))

    assert [r.url.params["offset"] for r in seen] == ["0", "5000"]
    assert all(r.headers["X-Api-Key"] == "secret-key" for r in seen)
    assert all("secret-key" not in str(r.url) for r in seen)
    assert seen[0].url.params["facets[series][]"] == "RBRTE"
    assert len(observations) == 22


def test_eia_error_raises_without_leaking_the_key():
    body = {"error": {"code": "API_KEY_INVALID", "message": "An invalid api_key was supplied."}}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json=body)

    with pytest.raises(MarketDataError, match="HTTP 403") as error:
        fetch_eia_brent(http_with(handler), "secret-key", date(2026, 1, 1))
    assert "secret-key" not in str(error.value)


# --- ECB ------------------------------------------------------------------------------------


def test_ecb_csv_gives_both_currencies_per_euro():
    observations = parse_ecb_csv((FIXTURES / "ecb_exr.csv").read_text())

    by_key = {(o.series, o.date): o for o in observations}
    usd = by_key[("EXR.D.USD.EUR.SP00.A", date(2026, 11, 6))]
    nok = by_key[("EXR.D.NOK.EUR.SP00.A", date(2026, 11, 6))]
    assert (usd.value, usd.unit) == (1.1165, "USD per EUR")
    assert (nok.value, nok.unit) == (10.526, "NOK per EUR")
    assert len(observations) == 18


def test_ecb_html_error_page_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, text="<html>maintenance</html>", headers={"content-type": "text/html"}
        )

    with pytest.raises(MarketDataError, match="expected CSV"):
        fetch_ecb_fx(http_with(handler), date(2026, 1, 1))


def test_ecb_gateway_timeout_raises():
    with pytest.raises(MarketDataError, match="HTTP 504"):
        fetch_ecb_fx(http_with(lambda _: httpx.Response(504, text="<html/>")), date(2026, 1, 1))


# --- World Bank -----------------------------------------------------------------------------


def test_pink_sheet_link_is_found_and_only_the_monthly_workbook_matches():
    html = (FIXTURES / "worldbank_commodity_markets_excerpt.html").read_text()
    assert find_pink_sheet_url(html).endswith("/related/CMO-Historical-Data-Monthly.xlsx")
    with pytest.raises(MarketDataError, match="link not found"):
        find_pink_sheet_url(html.replace("Monthly.xlsx", "Monthly.pdf"))


def test_pink_sheet_reads_ttf_and_brent_from_the_named_sheet():
    observations = parse_pink_sheet((FIXTURES / "worldbank_cmo_monthly_trimmed.xlsx").read_bytes())

    by_key = {(o.series, o.date): o for o in observations}
    gas = by_key[("Natural gas, Europe", date(2026, 10, 1))]
    brent = by_key[("Crude oil, Brent", date(2026, 10, 1))]
    assert (gas.value, gas.unit) == (28.5, "$/mmbtu")
    assert (brent.value, brent.unit) == (125.0, "$/bbl")
    # Only the two requested series, one value per month for each
    assert {o.series for o in observations} == {"Natural gas, Europe", "Crude oil, Brent"}
    assert len(observations) == 2 * 14


def test_pink_sheet_without_the_gas_column_raises():
    source = zipfile.ZipFile(FIXTURES / "worldbank_cmo_monthly_trimmed.xlsx")
    broken = io.BytesIO()
    with zipfile.ZipFile(broken, "w") as out:
        for name in source.namelist():
            data = source.read(name)
            if name == "xl/sharedStrings.xml":
                data = data.replace(b"Natural gas, Europe", b"Natural gas, Asia")
            out.writestr(name, data)
    with pytest.raises(MarketDataError, match="Natural gas, Europe"):
        parse_pink_sheet(broken.getvalue())


# --- Validation -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("observations", "message"),
    [
        ([], "no observations"),
        ([Observation("x", date(2026, 1, 1), -1.0, "u")], "bad value"),
        ([Observation("x", date(2026, 1, 1), float("nan"), "u")], "bad value"),
        ([Observation("x", date(2026, 1, 1), 1.0, "u")] * 2, "duplicate"),
    ],
)
def test_validate_refuses_bad_loads(observations, message):
    with pytest.raises(MarketDataError, match=message):
        validate(observations, "test")


# --- Share price CSVs -----------------------------------------------------------------------


def test_euronext_export_is_parsed_and_isin_checked():
    text = (FIXTURES / "euronext_format_synthetic.csv").read_text(encoding="utf-8")
    parsed = parse_share_csv(text, AKRBP, TODAY)

    assert parsed.format == "euronext"
    assert parsed.isin == "NO0010345853"
    first = min(parsed.observations, key=lambda o: o.date)
    assert (first.series, first.date, first.value, first.unit) == (
        "AKRBP",
        date(2026, 10, 6),
        99.75,
        "NOK",
    )
    assert first.extra == {"volume": 1500}


def test_euronext_export_for_another_isin_is_rejected():
    text = (FIXTURES / "euronext_format_synthetic.csv").read_text(encoding="utf-8")
    equinor = Listing("equinor", "EQNR", "NO0010096985", "NOK")
    with pytest.raises(MarketDataError, match="expected NO0010096985"):
        parse_share_csv(text, equinor, TODAY)


def test_euronext_decimal_comma_is_accepted():
    text = (FIXTURES / "euronext_format_synthetic.csv").read_text(encoding="utf-8")
    parsed = parse_share_csv(text.replace("99.75", "99,75"), AKRBP, TODAY)
    assert 99.75 in {o.value for o in parsed.observations}


def test_plain_csv_with_optional_volume():
    parsed = parse_share_csv("Date,Close\n2026-10-06,99.5\n2026-10-07,100\n", AKRBP, TODAY)
    assert parsed.format == "plain"
    assert [(o.date.day, o.value, o.extra["volume"]) for o in parsed.observations] == [
        (6, 99.5, None),
        (7, 100.0, None),
    ]


def test_plain_csv_without_a_close_column_is_rejected():
    with pytest.raises(MarketDataError, match="'date' and 'close'"):
        parse_share_csv("date;price\n2026-10-06;99\n", AKRBP, TODAY)


def test_future_dates_are_rejected():
    with pytest.raises(MarketDataError, match="future"):
        parse_share_csv("date,close\n2027-01-04,99\n", AKRBP, TODAY)


@pytest.mark.parametrize(
    ("name", "ticker"),
    [("EQNR.csv", "EQNR"), ("eqnr_2026-11-09.csv", "EQNR"), ("VAR-history.csv", "VAR")],
)
def test_ticker_comes_from_the_file_name(name, ticker):
    assert ticker_from_filename(Path(name)) == ticker


def test_listings_seed_covers_the_focus_companies():
    listings = load_listings(DBT_PROJECT_DIR / "seeds" / "share_listings.csv")
    assert {t: lst.group_id for t, lst in listings.items()} == {
        "AKRBP": "aker-bp",
        "VAR": "var-energi",
        "EQNR": "equinor",
    }
