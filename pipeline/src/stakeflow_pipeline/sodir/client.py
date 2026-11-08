"""Typed client for Sodir's DataService (an ArcGIS FeatureServer).

Paging rules observed on the live API:
- the server returns at most 2000 records per request, whatever you ask for
- `exceededTransferLimit: true` means there is another page
- errors may come back as HTML or as `{"error": {...}}` with HTTP 200

Retries are deliberately not handled here: the Dagster asset that calls this has a RetryPolicy.
"""

from collections.abc import Iterator
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from stakeflow_pipeline.sodir.layers import Layer

PAGE_SIZE = 2000


class SodirError(RuntimeError):
    pass


class Feature(BaseModel):
    properties: dict[str, Any]
    geometry: dict[str, Any] | None = None


class FeaturePage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    features: list[Feature]
    exceeded_transfer_limit: bool = Field(default=False, alias="exceededTransferLimit")


class CountResponse(BaseModel):
    count: int


class _PeriodAttributes(BaseModel):
    prfYear: int
    prfMonth: int


class _PeriodFeature(BaseModel):
    attributes: _PeriodAttributes


class LatestPeriodResponse(BaseModel):
    features: list[_PeriodFeature]


def make_http_client(base_url: str, timeout_s: float = 60.0) -> httpx.Client:
    return httpx.Client(base_url=base_url, timeout=timeout_s, follow_redirects=True)


class SodirClient:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def count(self, layer: Layer) -> int:
        data = self._query(layer, {"where": "1=1", "returnCountOnly": "true", "f": "json"})
        return CountResponse.model_validate(data).count

    def latest_production_month(self, profiles: Layer) -> str:
        """Newest month with monthly production, as 'YYYY-MM'. One tiny request.

        Used by the sensor to detect new data without downloading anything.
        """
        params: dict[str, str | int] = {
            "where": "prfPeriod='month'",
            "outFields": "prfYear,prfMonth",
            "orderByFields": "prfYear DESC,prfMonth DESC",
            "resultRecordCount": 1,
            "returnGeometry": "false",
            "f": "json",
        }
        response = LatestPeriodResponse.model_validate(self._query(profiles, params))
        if not response.features:
            raise SodirError("profiles: no monthly rows")
        period = response.features[0].attributes
        return f"{period.prfYear:04d}-{period.prfMonth:02d}"

    def iter_pages(self, layer: Layer) -> Iterator[list[Feature]]:
        offset = 0
        while True:
            page = FeaturePage.model_validate(self._query(layer, self._page_params(layer, offset)))
            yield page.features
            if not page.exceeded_transfer_limit:
                return
            if not page.features:
                raise SodirError(
                    f"layer {layer.id}: empty page at offset {offset} but more promised"
                )
            offset += len(page.features)

    @staticmethod
    def _page_params(layer: Layer, offset: int) -> dict[str, str | int]:
        return {
            "where": "1=1",
            "outFields": "*",
            # A stable order is what makes offset paging correct
            "orderByFields": "OBJECTID",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            "returnGeometry": str(layer.has_geometry).lower(),
            # Sodir stores ED50; ask for WGS84 so PostGIS and MapLibre need no reprojection
            "outSR": 4326,
            "f": "geojson",
        }

    def _query(self, layer: Layer, params: dict[str, str | int]) -> dict[str, Any]:
        response = self._http.get(f"/{layer.id}/query", params=params)
        response.raise_for_status()
        if "json" not in response.headers.get("content-type", ""):
            raise SodirError(f"layer {layer.id}: expected JSON, got: {response.text[:200]!r}")
        data: dict[str, Any] = response.json()
        if "error" in data:
            raise SodirError(f"layer {layer.id}: {data['error']}")
        return data
