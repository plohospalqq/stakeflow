"""/prices, share prices and the scenario explorer, end to end on the real marts.

Price and scenario data exist only where the market job (or its CI fixtures) and the models
have run, so data-dependent checks skip with a reason when it is missing; input validation and
"explain instead of fail" behaviour are tested either way.
"""

import pytest

CONTRACT = {
    "brent_change_pct",
    "ttf_change_pct",
    "production_change_pct",
    "eurusd_change_pct",
    "horizon_months",
}


def scenario_or_skip(client, company: str, **params) -> dict:
    response = client.get(f"/companies/{company}/scenario", params=params)
    if response.status_code == 503:
        pytest.skip(f"no scenario model here: {response.json()['detail']}")
    assert response.status_code == 200, response.text
    return response.json()


# --- /prices --------------------------------------------------------------------------------


def test_price_catalogue_states_unit_source_and_licence(client):
    series = {s["id"]: s for s in client.get("/prices").json()}

    assert set(series) == {"brent", "ttf", "eurusd", "usdnok"}
    assert series["brent"]["unit"] == "USD/bbl"
    assert series["brent"]["licence"].startswith("Public domain")
    assert (series["ttf"]["unit"], series["ttf"]["frequency"]) == ("EUR/MWh", "monthly")
    assert series["ttf"]["licence"] == "CC BY 4.0"
    assert "ECB" in series["eurusd"]["attribution"]
    for s in series.values():
        dates = [p["date"] for p in s["points"]]
        assert dates == sorted(dates)
        assert all(p["value"] > 0 for p in s["points"])


def test_prices_can_be_filtered_by_series_and_window(client):
    body = client.get(
        "/prices", params={"series": "brent", "start": "2026-10-20", "end": "2026-10-31"}
    ).json()
    assert [s["id"] for s in body] == ["brent"]
    assert all("2026-10-20" <= p["date"] <= "2026-10-31" for p in body[0]["points"])


def test_ttf_is_monthly_and_only_from_when_the_series_is_ttf(client):
    (ttf,) = client.get("/prices", params={"series": "ttf", "start": "2010-01-01"}).json()
    if not ttf["points"]:
        pytest.skip("no TTF loaded")
    assert all(p["date"].endswith("-01") for p in ttf["points"])
    # Before April 2015 the World Bank's European gas series is not TTF
    assert ttf["points"][0]["date"] >= "2015-04-01"


def test_latest_prices_are_spot_values_in_forward_price_field_names(client):
    response = client.get("/prices/latest")
    if response.status_code == 503:
        pytest.skip("no prices loaded")
    body = response.json()
    assert body["kind"] == "spot"
    assert body["brentUsdPerBbl"] > 0 and body["eurUsd"] > 0
    assert body["ttfMonth"].endswith("-01")
    assert body["asOf"] >= body["brentDate"]


@pytest.mark.parametrize(
    "params", [{"series": "gold"}, {"start": "2026-02-01", "end": "2026-01-01"}, {"start": "x"}]
)
def test_bad_price_parameters_are_rejected(client, params):
    assert client.get("/prices", params=params).status_code == 422


# --- Share prices ---------------------------------------------------------------------------


def test_share_price_says_where_it_comes_from(client):
    body = client.get("/companies/aker-bp/share-price").json()
    assert (body["ticker"], body["isin"], body["currency"]) == ("AKRBP", "NO0010345853", "NOK")
    assert "personal use" in body["note"]
    dates = [p["date"] for p in body["points"]]
    assert dates == sorted(dates)
    assert all(p["close"] > 0 for p in body["points"])


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/companies/no-such-company/share-price", 404),
        ("/companies/petoro/share-price", 404),  # a company, but no listed share
        ("/companies/aker-bp/share-price?start=2026-11-05&end=2026-11-01", 422),
    ],
)
def test_share_price_bad_requests(client, path, status):
    assert client.get(path).status_code == status


# --- Scenarios ------------------------------------------------------------------------------


def test_presets_use_the_shared_contract(client):
    presets = client.get("/scenarios/presets").json()
    assert {"calm-year", "oil-crash", "gas-spike", "sverdrup-outage"} <= {p["id"] for p in presets}
    for preset in presets:
        assert set(preset["params"]) == CONTRACT
        assert preset["name"] and preset["description"]


@pytest.mark.parametrize(
    "params",
    [
        {"brent_change_pct": -91},
        {"ttf_change_pct": 301},
        {"production_change_pct": -101},
        {"eurusd_change_pct": 101},
        {"horizon_months": 0},
        {"horizon_months": 25},
        {"horizon_months": 2.5},
        {"brent_change_pct": "a lot"},
        {"brent_change": 10},
    ],
)
def test_scenario_rejects_parameters_outside_the_contract(client, params):
    assert client.get("/companies/aker-bp/scenario", params=params).status_code == 422


@pytest.mark.parametrize(("company", "status"), [("no-such-company", 404), ("petoro", 404)])
def test_scenario_for_unknown_or_unlisted_company(client, company, status):
    assert client.get(f"/companies/{company}/scenario").status_code == status


def test_scenario_without_a_model_explains_why(client):
    response = client.get("/companies/var-energi/scenario")
    if response.status_code == 200:
        pytest.skip("a model exists here")
    assert response.status_code == 503
    assert "Import share prices" in response.json()["detail"]


def test_scenario_shows_result_band_fit_and_notice(client):
    body = scenario_or_skip(client, "aker-bp", brent_change_pct=-30, horizon_months=3)

    assert body["notice"] == "Scenario, not a forecast; not investment advice."
    assert body["scenario"] == {
        "brent_change_pct": -30,
        "ttf_change_pct": 0,
        "production_change_pct": 0,
        "eurusd_change_pct": 0,
        "horizon_months": 3,
    }
    band = body["band80"]
    assert band["loChangePct"] <= body["changePct"] <= band["hiChangePct"]
    assert body["price"] == pytest.approx(body["base"]["close"] * (1 + body["changePct"] / 100))
    assert [p["monthOffset"] for p in body["path"]] == [1, 2, 3]
    assert 0 <= body["varianceFromCoefficients"] <= 1

    model = body["model"]
    assert {c["term"] for c in model["coefficients"]} == {
        "intercept",
        "brent",
        "ttf",
        "production",
        "eurusd",
    }
    assert all(c["stdError"] > 0 for c in model["coefficients"])
    assert 0 <= model["r2"] <= 1 and model["nObs"] >= 18
    assert model["windowStart"] < model["windowEnd"]
    assert model["backtest"]["note"]
    brent = next(c for c in body["contributions"] if c["driver"] == "brent")
    assert brent["inputChangePct"] == -30


def test_calm_year_has_no_central_change_but_an_honest_band(client):
    body = scenario_or_skip(client, "aker-bp", horizon_months=12)
    assert body["changePct"] == 0
    assert body["band80"]["loChangePct"] < 0 < body["band80"]["hiChangePct"]
    assert body["varianceFromCoefficients"] == 0


def test_equinor_scenario_says_production_is_ncs_only(client):
    body = scenario_or_skip(client, "equinor", ttf_change_pct=50)
    assert body["companyName"] == "Equinor (NCS only)"
    assert any("whole company" in c for c in body["caveats"])
