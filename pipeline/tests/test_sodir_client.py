"""SodirClient against recorded Sodir responses (no network)."""

import json
from pathlib import Path

import httpx
import pytest

from stakeflow_pipeline.sodir.client import SodirClient, SodirError
from stakeflow_pipeline.sodir.layers import LAYERS_BY_NAME

FIXTURES = Path(__file__).parent / "fixtures"
LAYER = LAYERS_BY_NAME["field_operator_hst"]


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def client_with(handler) -> SodirClient:
    http = httpx.Client(base_url="https://sodir.test", transport=httpx.MockTransport(handler))
    return SodirClient(http)


def test_pages_until_server_stops_promising_more():
    seen_offsets: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        offset = int(request.url.params["resultOffset"])
        seen_offsets.append(offset)
        page = (
            "field_operator_hst_page1.json" if offset == 0 else "field_operator_hst_last_page.json"
        )
        return httpx.Response(200, json=fixture(page))

    pages = list(client_with(handler).iter_pages(LAYER))

    assert [len(p) for p in pages] == [2, 1]
    # The next offset is the number of records actually received, not the page size asked for
    assert seen_offsets == [0, 2]
    assert pages[0][0].properties["fldName"] == "SYGNA"


def test_requests_stable_order_and_wgs84():
    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        assert request.url.path == f"/{LAYER.id}/query"
        assert params["orderByFields"] == "OBJECTID"
        assert params["outSR"] == "4326"
        assert params["returnGeometry"] == "false"
        return httpx.Response(200, json=fixture("field_operator_hst_last_page.json"))

    list(client_with(handler).iter_pages(LAYER))


def test_count():
    client = client_with(lambda _: httpx.Response(200, json={"count": 580}))
    assert client.count(LAYER) == 580


def test_arcgis_error_with_http_200_raises():
    body = {"error": {"code": 400, "message": "Invalid query parameters"}}
    with pytest.raises(SodirError, match="Invalid query"):
        client_with(lambda _: httpx.Response(200, json=body)).count(LAYER)


def test_html_error_page_raises():
    html = "<html><title>Error: Layer not found</title></html>"
    response = httpx.Response(200, text=html, headers={"content-type": "text/html"})
    with pytest.raises(SodirError, match="expected JSON"):
        client_with(lambda _: response).count(LAYER)


def test_empty_page_that_promises_more_raises_instead_of_looping_forever():
    body = {"type": "FeatureCollection", "features": [], "exceededTransferLimit": True}
    with pytest.raises(SodirError, match="empty page"):
        list(client_with(lambda _: httpx.Response(200, json=body)).iter_pages(LAYER))
