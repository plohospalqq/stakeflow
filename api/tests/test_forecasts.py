"""Forecast, nowcast and prediction-log endpoints on the marts built from a forecast run."""

import re

import psycopg
import pytest

from stakeflow_api.db import conninfo_from_env

SHA256 = re.compile(r"^[0-9a-f]{64}$")


@pytest.fixture(scope="module")
def api(client):
    """The client, once the forecast marts exist (stakeflow-forecast + dbt build -s tag:ml)."""
    with psycopg.connect(conninfo_from_env(), connect_timeout=3) as conn:
        built = conn.execute("select to_regclass('marts.fct_prediction_scores')").fetchone()
    if not built or built[0] is None:
        pytest.skip("forecast marts not built; run stakeflow-forecast and dbt build -s tag:ml")
    return client


def sverdrup_id(api) -> int:
    return next(f["id"] for f in api.get("/fields", params={"q": "sverdrup"}).json())


def test_field_forecast_has_a_range_and_a_model_card(api):
    body = api.get(f"/fields/{sverdrup_id(api)}/forecast").json()
    points = body["points"]
    assert points[0]["isActual"] is True
    assert len(points) == 1 + 36
    months = [p["month"] for p in points]
    assert months == sorted(months) and len(set(months)) == len(months)
    for p in points:
        assert 0 <= p["p10"] <= p["p50"] <= p["p90"]

    model = body["model"]
    assert model["status"] in {"arps", "plateau", "ramp_up", "too_short", "shut_down"}
    assert model["version"].startswith("arps-")
    assert model["runAt"] and model["dataThrough"] < points[1]["month"]
    if model["status"] == "arps":
        assert 0 <= model["b"] <= 1.5
        assert model["fitWindow"]["start"] < model["fitWindow"]["end"]
    assert body["events"] == []


def test_field_without_a_forecast_is_404(api):
    assert api.get("/fields/1/forecast").status_code == 404
    assert api.get("/fields/not-a-number/forecast").status_code == 422


def test_nowcasts_cover_the_focus_companies(api):
    nowcasts = api.get("/nowcasts").json()
    by_company = {n["companyId"]: n for n in nowcasts}
    assert set(by_company) == {"aker-bp", "var-energi", "equinor"}
    assert by_company["equinor"]["companyName"] == "Equinor (NCS only)"
    assert by_company["aker-bp"]["reportKind"] == "trading update"
    for n in nowcasts:
        assert n["lo"] <= n["value"] <= n["hi"]
        assert 0 <= n["monthsInData"] <= 3
        assert SHA256.match(n["hash"]) and SHA256.match(n["inputHash"])
        assert n["expectedReportOn"] > n["quarterStart"]
        assert n["status"] in {"open", "resolved"}
        # Data used must be older than the quarter's last month (no look-ahead)
        assert n["dataThrough"] < n["expectedReportOn"]


def test_prediction_log_scores_against_actuals_and_baseline(api):
    log = api.get("/predictions").json()
    assert {p["kind"] for p in log} >= {"live", "backtest"}
    assert len({p["hash"] for p in log}) == len(log)
    for p in log:
        assert p["lo"] <= p["predicted"] <= p["hi"]
        if p["actual"] is not None:
            assert p["status"] == "resolved"
            expected = 100 * (p["predicted"] - p["actual"]) / p["actual"]
            assert p["errorPct"] == pytest.approx(expected, abs=0.01)
            assert p["inRange"] == (p["lo"] <= p["actual"] <= p["hi"])
        if p["attributedActual"] is not None:
            expected = 100 * (p["predicted"] - p["attributedActual"]) / p["attributedActual"]
            assert p["attributedErrorPct"] == pytest.approx(expected, abs=0.01)


def test_prediction_log_filters(api):
    aker = api.get("/predictions", params={"company": "aker-bp", "kind": "backtest"}).json()
    assert aker and {(p["companyId"], p["kind"]) for p in aker} == {("aker-bp", "backtest")}
    latest = api.get("/predictions", params={"latest": "true"}).json()
    assert all(p["isLatest"] for p in latest)
    keys = [(p["companyId"], p["quarterStart"], p["kind"], p["modelVersion"]) for p in latest]
    assert len(keys) == len(set(keys))
    assert api.get("/predictions", params={"company": "no-such-company"}).json() == []
    assert api.get("/predictions", params={"kind": "guess"}).status_code == 422


def test_q3_2026_backtest_is_scored_against_the_trading_update(api):
    rows = api.get("/predictions", params={"company": "aker-bp", "kind": "backtest"}).json()
    q3 = next(p for p in rows if p["quarterStart"] == "2026-07-01" and p["isLatest"])
    assert q3["actual"] == 374.3
    assert q3["baseline"] == 383.6
    assert q3["reportedOn"] == "2026-10-14"
    assert q3["asOf"] == "2026-09-30"
