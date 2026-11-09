"""The static demo exporter (scripts/export_static.py) on the real marts."""

import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "export_static.py"


def load_exporter():
    spec = importlib.util.spec_from_file_location("export_static", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def exported(client, tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("data")
    load_exporter().export_all(client, out, "live")
    return out


def read(out: Path, file: str):
    return json.loads((out / file).read_text(encoding="utf-8"))


def test_snapshot_meta_records_month_and_series_windows(exported, client):
    meta = read(exported, "meta/snapshot.json")
    latest = client.get("/meta/freshness").json()["latestMonth"]
    assert meta["latestMonth"] == latest
    assert meta["source"] == "live"
    assert meta["seriesStart"]["company"] < latest
    assert meta["seriesStart"]["field"] < meta["seriesStart"]["company"]


def test_every_field_has_detail_ownership_and_production(exported):
    for field in read(exported, "fields/all.json"):
        for part in ("detail", "ownership", "production"):
            assert (exported / f"fields/{field['id']}/{part}.json").is_file(), (field, part)


def test_every_linkable_company_is_exported(exported):
    focus = read(exported, "companies/focus.json")
    producing = read(exported, "companies/all.json")
    for company in focus + producing:
        for part in ("detail", "production", "fields", "quarters"):
            assert (exported / f"companies/{company['id']}/{part}.json").is_file()
        assert (exported / f"fields/owner/{company['id']}.json").is_file()


def test_files_are_the_api_responses(exported, client):
    assert (
        read(exported, "companies/aker-bp/detail.json") == client.get("/companies/aker-bp").json()
    )
    # The company window is the API default range
    production = read(exported, "companies/aker-bp/production.json")
    assert production == client.get("/companies/aker-bp/production").json()


def test_field_series_reach_back_to_the_field_window(exported):
    meta = read(exported, "meta/snapshot.json")
    longest = max(
        (
            read(exported, f"fields/{f['id']}/production.json")
            for f in read(exported, "fields/all.json")
        ),
        key=len,
    )
    assert longest[0]["month"] >= meta["seriesStart"]["field"]
    assert longest[-1]["month"] == meta["latestMonth"]


def test_every_field_with_a_model_card_has_its_forecast(exported, client):
    fields = read(exported, "fields/all.json")
    with_card = [
        f["id"] for f in fields if client.get(f"/fields/{f['id']}/forecast").status_code == 200
    ]
    assert with_card, "no field has a model card; run the forecast first"
    for field_id in with_card:
        assert (exported / f"fields/{field_id}/forecast.json").is_file(), field_id
    without = {f["id"] for f in fields} - set(with_card)
    for field_id in without:
        assert not (exported / f"fields/{field_id}/forecast.json").exists(), field_id
    first = with_card[0]
    assert (
        read(exported, f"fields/{first}/forecast.json")
        == client.get(f"/fields/{first}/forecast").json()
    )


def test_models_and_markets_are_the_api_responses(exported, client):
    expected = {
        "models/nowcasts.json": client.get("/nowcasts"),
        "models/predictions.json": client.get("/predictions", params={"latest": True}),
        "anomalies/all.json": client.get("/anomalies", params={"limit": 500}),
        "prices/series.json": client.get("/prices", params={"series": ["brent", "ttf"]}),
        "prices/latest.json": client.get("/prices/latest"),
    }
    for file, response in expected.items():
        if response.status_code == 503:
            # Not run on this database yet: the exporter leaves the file out
            assert not (exported / file).exists(), file
            continue
        assert read(exported, file) == response.json(), file


def test_prices_hold_brent_and_ttf_only(exported):
    if not (exported / "prices/series.json").is_file():
        pytest.skip("no prices loaded")
    series = read(exported, "prices/series.json")
    assert sorted(s["id"] for s in series) == ["brent", "ttf"]
    assert {s["id"]: s["frequency"] for s in series} == {"brent": "daily", "ttf": "monthly"}


def test_nothing_derived_from_euronext_is_exported(exported):
    # Share prices are the user's own Euronext download: never redistributed, so neither the
    # series nor a scenario computed from them may land in the public demo.
    names = [p.relative_to(exported).as_posix() for p in exported.rglob("*") if p.is_file()]
    assert not [n for n in names if "share" in n or "scenario" in n]
