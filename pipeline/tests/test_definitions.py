"""The Dagster code location loads and the asset graph is wired the way the docs describe."""

from dagster import AssetKey

from stakeflow_pipeline.assets.market import market_raw_assets
from stakeflow_pipeline.definitions import defs


def test_definitions_load(monkeypatch):
    for name in ("SODIR_BASE_URL", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    defs.validate_loadable(defs)
    assert defs.resolve_sensor_def("sodir_new_month_sensor")


def test_sodir_refresh_never_downloads_market_data():
    sodir = defs.resolve_job_def("sodir_refresh").asset_layer.selected_asset_keys
    market = defs.resolve_job_def("market_refresh").asset_layer.selected_asset_keys
    downloads = {key for asset in market_raw_assets for key in asset.keys}

    assert len(downloads) == 4
    assert not downloads & sodir
    assert downloads <= market
    assert AssetKey(["marts", "fct_prices"]) in market
    assert AssetKey(["raw", "sodir_profiles"]) not in market


def test_ml_views_sit_downstream_of_the_python_model_and_the_sodir_refresh_runs_it():
    graph = defs.resolve_asset_graph()
    anomalies = AssetKey(["ml", "anomaly_evaluations"])
    assert AssetKey(["marts", "fct_field_production_monthly"]) in graph.get(anomalies).parent_keys
    assert anomalies in graph.get(AssetKey(["marts", "fct_anomalies"])).parent_keys
    sodir = defs.resolve_job_def("sodir_refresh").asset_layer.selected_asset_keys
    assert {anomalies, AssetKey(["marts", "fct_anomalies"])} <= sodir


def test_scenario_model_refits_when_prices_or_production_change():
    graph = defs.resolve_asset_graph()
    models = AssetKey(["ml", "share_price_models"])
    parents = graph.get(models).parent_keys
    assert {AssetKey(["marts", "fct_prices_monthly"]), AssetKey(["marts", "share_listings"])} <= (
        parents
    )
    for job in ("market_refresh", "sodir_refresh"):
        selected = defs.resolve_job_def(job).asset_layer.selected_asset_keys
        assert {models, AssetKey(["marts", "fct_share_price_models"])} <= selected, job


def test_dbt_models_sit_downstream_of_raw_assets():
    graph = defs.resolve_asset_graph()
    staging_production = AssetKey(["staging", "stg_sodir__production_monthly"])
    assert AssetKey(["raw", "sodir_profiles"]) in graph.get(staging_production).parent_keys
    assert AssetKey(["marts", "fct_group_production_monthly"]) in graph.get_all_asset_keys()
