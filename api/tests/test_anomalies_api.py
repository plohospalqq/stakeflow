"""/anomalies end to end: the frontend's Anomaly shape, band consistency and owner impacts."""

import pytest

FRONTEND_KEYS = {
    "id",
    "fieldId",
    "fieldName",
    "operatorName",
    "month",
    "pctVsExpected",
    "severity",
    "status",
    "note",
    "expected",
    "actual",
    "series",
    "hits",
}


@pytest.fixture(scope="module")
def anomalies(client) -> list[dict]:
    body = client.get("/anomalies", params={"limit": 500}).json()
    if not body:
        pytest.skip("no anomaly run with results here; run `stakeflow-ml anomalies`")
    return body


def test_feed_has_the_shape_the_frontend_expects(anomalies):
    for a in anomalies:
        assert a.keys() >= FRONTEND_KEYS
        assert a["status"] == "new"
        assert a["severity"] in {"high", "medium", "low"}
        assert a["pctVsExpected"] == pytest.approx(100 * (a["actual"] / a["expected"] - 1))
        assert abs(a["pctVsExpected"]) > 10
        assert a["note"]


def test_newest_and_largest_first(anomalies):
    months = [a["month"] for a in anomalies]
    assert months == sorted(months, reverse=True)


def test_mini_chart_ends_at_the_anomaly_and_the_point_is_outside_the_band(anomalies):
    for a in anomalies[:50]:
        series = a["series"]
        assert 1 <= len(series) <= 18
        last = series[-1]
        assert last["month"] == a["month"]
        assert last["actual"] < last["lo"] or last["actual"] > last["hi"]
        assert all(p["lo"] <= p["expected"] <= p["hi"] for p in series)


def test_owner_impact_is_the_miss_times_the_current_share(anomalies):
    for a in anomalies[:50]:
        assert sum(h["sharePct"] for h in a["hits"]) <= 100.01
        for h in a["hits"]:
            assert h["kboed"] == pytest.approx((a["actual"] - a["expected"]) * h["sharePct"] / 100)


def test_equinor_is_labelled_ncs_only_in_hits(anomalies):
    names = {h["companyName"] for a in anomalies for h in a["hits"] if h["companyId"] == "equinor"}
    assert names <= {"Equinor (NCS only)"}


def test_filters(client, anomalies):
    high = client.get("/anomalies", params={"severity": "high"}).json()
    assert all(a["severity"] == "high" for a in high)
    for a in client.get("/anomalies", params={"company": "aker-bp"}).json():
        assert any(h["companyId"] == "aker-bp" for h in a["hits"])
    since = anomalies[0]["month"]
    assert all(
        a["month"] >= since for a in client.get("/anomalies", params={"since": since}).json()
    )


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"severity": "huge"}, 422),
        ({"limit": 0}, 422),
        ({"limit": 501}, 422),
        ({"since": "last week"}, 422),
        ({"field_id": "x"}, 422),
        ({"company": "no-such-company"}, 404),
    ],
)
def test_bad_parameters(client, params, status):
    assert client.get("/anomalies", params=params).status_code == status


def test_run_describes_the_method(client):
    response = client.get("/anomalies/run")
    if response.status_code == 503:
        pytest.skip("no anomaly run yet")
    body = response.json()
    assert "10%" in body["method"] and "3 robust" in body["method"]
    assert body["params"]["pct_threshold"] == 0.1
    assert body["flaggedFrom"] <= body["latestMonth"]
