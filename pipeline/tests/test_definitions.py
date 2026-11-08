"""The Dagster code location loads: asset keys, checks, sensor and schedule wire up."""

from dagster import AssetKey

from stakeflow_pipeline.definitions import defs


def test_definitions_load(monkeypatch):
    for name in ("SODIR_BASE_URL", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    defs.validate_loadable(defs)

    keys = defs.resolve_asset_graph().get_all_asset_keys()
    assert AssetKey(["raw", "sodir_profiles"]) in keys
    assert defs.resolve_sensor_def("sodir_new_month_sensor")
