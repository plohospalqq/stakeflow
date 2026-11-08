"""End-to-end API tests on the real marts (or the CI fixture snapshot)."""

import pytest


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_freshness_names_source_and_licence(client):
    body = client.get("/meta/freshness").json()
    assert body["source"] == "Sodir"
    assert "NLOD" in body["licence"]
    assert body["latestMonth"].endswith("-01")


def test_focus_companies_and_equinor_label(client):
    companies = client.get("/companies", params={"focus": "true"}).json()
    names = {c["id"]: c["name"] for c in companies}
    assert set(names) == {"equinor", "aker-bp", "var-energi"}
    assert names["equinor"] == "Equinor (NCS only)"


def test_company_production_products_add_up(client):
    points = client.get("/companies/aker-bp/production").json()
    assert len(points) == 36
    assert [p["month"] for p in points] == sorted(p["month"] for p in points)
    for p in points:
        parts = p["oilSm3"] + p["gasOeSm3"] + p["nglSm3"] + p["condensateSm3"]
        assert parts == pytest.approx(p["oeSm3"], rel=1e-9)
        assert p["boePerDay"] == pytest.approx(p["oeSm3"] * 6.2898 / p["daysInMonth"], rel=1e-9)


def test_unknown_company_is_404(client):
    assert client.get("/companies/no-such-company").status_code == 404


def test_start_after_end_is_rejected(client):
    response = client.get(
        "/companies/aker-bp/production", params={"start": "2026-05-01", "end": "2026-01-01"}
    )
    assert response.status_code == 422


def test_reconciliation_has_reported_figure(client):
    quarters = client.get("/companies/aker-bp/quarters").json()
    q2 = next(q for q in quarters if q["quarterStart"] == "2026-04-01")
    assert q2["reportedKboeD"] == 383.6
    assert q2["isComplete"]
    assert abs(q2["errorPct"]) < 2


def test_field_detail_and_ownership_history(client):
    fields = client.get("/fields", params={"q": "sverdrup"}).json()
    sverdrup = next(f for f in fields if f["name"] == "JOHAN SVERDRUP")
    detail = client.get(f"/fields/{sverdrup['id']}").json()
    assert sum(o["sharePct"] for o in detail["currentOwners"]) == pytest.approx(100, abs=0.01)

    history = client.get(f"/fields/{sverdrup['id']}/ownership").json()
    lundin = [p for p in history if p["companyName"] == "Lundin Energy Norway AS"]
    assert lundin and lundin[-1]["validTo"] == "2022-06-30"


def test_geojson_has_geometry_and_properties(client):
    collection = client.get("/fields/geojson").json()
    assert collection["type"] == "FeatureCollection"
    feature = collection["features"][0]
    assert feature["geometry"]["type"] in {"Polygon", "MultiPolygon"}
    assert {"id", "name", "status", "boePerDay"} <= feature["properties"].keys()


def test_search_is_literal_not_a_like_pattern(client):
    # "%" and "_" are LIKE wildcards; a name search must treat them as plain characters
    assert client.get("/companies", params={"q": "%", "producing": "false"}).json() == []
    assert client.get("/fields", params={"q": "_"}).json() == []
    assert client.get("/fields", params={"q": "SVERDRUP"}).json()[0]["name"] == "JOHAN SVERDRUP"
