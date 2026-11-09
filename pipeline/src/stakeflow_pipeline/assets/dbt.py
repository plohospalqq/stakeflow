"""dbt models as Dagster assets. dbt tests become Dagster asset checks automatically.

dbt sources are named `raw.sodir_<layer>`, the same keys the raw assets use, so every model sits
downstream of the ingestion that feeds it.

Two groups: the warehouse, and the views over the `ml` schema (tag `ml`). The Python ML assets
read the first and feed the second; one dbt asset on both sides of them would be a cycle.
"""

from collections.abc import Iterator, Mapping
from typing import Any

from dagster import AssetExecutionContext, AssetKey
from dagster_dbt import DagsterDbtTranslator, DbtCliResource, DbtProject, dbt_assets

from stakeflow_pipeline.settings import DBT_PROJECT_DIR

dbt_project = DbtProject(project_dir=DBT_PROJECT_DIR, profiles_dir=DBT_PROJECT_DIR)


class StakeflowDbtTranslator(DagsterDbtTranslator):
    """Key models by Postgres schema (staging/…, marts/…) so the graph mirrors the warehouse."""

    def get_asset_key(self, dbt_resource_props: Mapping[str, Any]) -> AssetKey:
        if dbt_resource_props["resource_type"] == "source":
            return super().get_asset_key(dbt_resource_props)
        schema = dbt_resource_props["config"].get("schema") or "public"
        return AssetKey([schema, dbt_resource_props["name"]])

    def get_group_name(self, dbt_resource_props: Mapping[str, Any]) -> str | None:
        return dbt_resource_props["config"].get("schema") or "dbt"


@dbt_assets(
    manifest=dbt_project.manifest_path,
    project=dbt_project,
    dagster_dbt_translator=StakeflowDbtTranslator(),
    exclude="tag:ml",
)
def stakeflow_dbt_assets(context: AssetExecutionContext, dbt: DbtCliResource) -> Iterator[Any]:
    yield from dbt.cli(["build"], context=context).stream()


@dbt_assets(
    manifest=dbt_project.manifest_path,
    project=dbt_project,
    dagster_dbt_translator=StakeflowDbtTranslator(),
    select="tag:ml",
    name="stakeflow_dbt_ml_views",
)
def stakeflow_dbt_ml_views(context: AssetExecutionContext, dbt: DbtCliResource) -> Iterator[Any]:
    yield from dbt.cli(["build"], context=context).stream()
