"""HTTP caching: Cache-Control and a weak ETag from the data freshness, 304 on If-None-Match."""

import pytest
from fastapi import FastAPI, HTTPException, Response
from fastapi.testclient import TestClient

from stakeflow_api.caching import CACHE_CONTROL, etag_matches, make_etag, not_modified


@pytest.mark.parametrize(
    ("header", "matches"),
    [
        (None, False),
        ("", False),
        ('W/"abc"', True),
        ('"abc"', True),  # weak comparison ignores W/
        ('"x", W/"abc"', True),
        ('"x",W/"abc" ', True),
        ("*", True),
        ('W/"abd"', False),
        ("abc", False),  # unquoted is not the same entity tag
    ],
)
def test_etag_matches_uses_weak_comparison(header, matches):
    assert etag_matches(header, 'W/"abc"') is matches


def test_make_etag_is_weak_stable_and_changes_with_the_data():
    a = make_etag("2026-08-01", "2026-11-09T11:35:56Z")
    assert a.startswith('W/"') and a.endswith('"')
    assert a == make_etag("2026-08-01", "2026-11-09T11:35:56Z")
    assert a != make_etag("2026-09-01", "2026-11-09T11:35:56Z")
    assert a != make_etag("2026-08-01", "2026-12-09T11:35:56Z")


# --- middleware, on a stub app (no database) -------------------------------------------------


@pytest.fixture(scope="module")
def stub() -> TestClient:
    app = FastAPI()
    app.middleware("http")(not_modified)

    @app.get("/data")
    def data(response: Response) -> dict[str, int]:
        response.headers["ETag"] = 'W/"v1"'
        response.headers["Cache-Control"] = CACHE_CONTROL
        return {"n": 1}

    @app.get("/missing")
    def missing() -> None:
        raise HTTPException(404)

    return TestClient(app)


def test_middleware_answers_a_matching_if_none_match_with_an_empty_304(stub):
    response = stub.get("/data", headers={"If-None-Match": 'W/"v1"'})
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == 'W/"v1"'
    assert response.headers["cache-control"] == CACHE_CONTROL


def test_middleware_sends_the_body_when_the_etag_differs(stub):
    response = stub.get("/data", headers={"If-None-Match": 'W/"v0"'})
    assert response.status_code == 200
    assert response.json() == {"n": 1}


def test_middleware_leaves_errors_alone(stub):
    assert stub.get("/missing", headers={"If-None-Match": "*"}).status_code == 404


# --- the real API on the marts (skips without a database) ------------------------------------


def test_data_endpoints_send_cache_control_and_a_weak_etag(client):
    response = client.get("/companies/aker-bp")
    assert response.status_code == 200
    assert response.headers["cache-control"] == CACHE_CONTROL
    assert response.headers["etag"].startswith('W/"')


def test_every_data_endpoint_shares_the_freshness_etag(client):
    paths = ["/meta/freshness", "/companies", "/fields", "/fields/geojson"]
    etags = {client.get(p).headers.get("etag") for p in paths}
    assert len(etags) == 1 and None not in etags


def test_revalidation_with_the_current_etag_is_a_304_without_body(client):
    etag = client.get("/companies/aker-bp/production").headers["etag"]
    response = client.get("/companies/aker-bp/production", headers={"If-None-Match": etag})
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == etag
    assert response.headers["cache-control"] == CACHE_CONTROL


def test_a_stale_etag_gets_the_full_response(client):
    response = client.get("/companies/aker-bp/production", headers={"If-None-Match": 'W/"old"'})
    assert response.status_code == 200
    assert len(response.json()) == 36


def test_errors_and_health_are_not_cached(client):
    for path in ["/health", "/companies/no-such-company", "/fields/not-a-number"]:
        response = client.get(path, headers={"If-None-Match": "*"})
        assert response.status_code in {200, 404, 422}, path
        assert "etag" not in response.headers, path
        assert "cache-control" not in response.headers, path
