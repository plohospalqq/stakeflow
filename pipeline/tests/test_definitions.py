"""The Dagster code location loads and the asset graph is wired the way the docs describe."""

from dagster import AssetKey

from stakeflow_pipeline.definitions import defs


def test_definitions_load(monkeypatch):
    for name in ("SODIR_BASE_URL", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    defs.validate_loadable(defs)
    assert defs.resolve_sensor_def("sodir_new_month_sensor")


def test_dbt_models_sit_downstream_of_raw_assets():
    graph = defs.resolve_asset_graph()
    staging_production = AssetKey(["staging", "stg_sodir__production_monthly"])
    assert AssetKey(["raw", "sodir_profiles"]) in graph.get(staging_production).parent_keys
    assert AssetKey(["marts", "fct_group_production_monthly"]) in graph.get_all_asset_keys()


def test_forecast_run_sits_between_the_marts_and_the_ml_models():
    graph = defs.resolve_asset_graph()
    predictions = AssetKey(["ml", "predictions"])
    assert AssetKey(["marts", "fct_field_production_monthly"]) in graph.get(predictions).parent_keys
    scores = AssetKey(["marts", "fct_prediction_scores"])
    assert predictions in graph.get(scores).parent_keys
    forecast = AssetKey(["marts", "fct_field_forecast"])
    assert graph.get(forecast).parent_keys == {AssetKey(["ml", "field_forecast"])}
    # One refresh job runs it all, in order
    assert predictions in defs.resolve_job_def("sodir_refresh").asset_layer.selected_asset_keys
