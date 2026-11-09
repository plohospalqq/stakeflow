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
