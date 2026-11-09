"""dbt models as Dagster assets. dbt tests become Dagster asset checks automatically.

dbt sources are named `raw.sodir_<layer>`, the same keys the raw assets use, so every model sits
downstream of the ingestion that feeds it.
"""

import os
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any

from dagster import AssetExecutionContext, AssetKey
from dagster_dbt import DagsterDbtTranslator, DbtCliResource, DbtProject, dbt_assets

# pipeline/src/stakeflow_pipeline/assets/dbt.py → pipeline/dbt (also /app/dbt in the image)
_DEFAULT_DBT_DIR = Path(__file__).resolve().parents[3] / "dbt"
DBT_PROJECT_DIR = Path(os.environ.get("DBT_PROJECT_DIR", _DEFAULT_DBT_DIR))

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


# Two selections because the forecast run (assets/ml.py) sits between them: it reads the marts
# and the ml-tagged models read what it writes. One dbt asset would make a cycle.
ML_MODELS = "tag:ml"


@dbt_assets(
    manifest=dbt_project.manifest_path,
    project=dbt_project,
    dagster_dbt_translator=StakeflowDbtTranslator(),
    exclude=ML_MODELS,
)
def stakeflow_dbt_assets(context: AssetExecutionContext, dbt: DbtCliResource) -> Iterator[Any]:
    yield from dbt.cli(["build"], context=context).stream()


@dbt_assets(
    manifest=dbt_project.manifest_path,
    project=dbt_project,
    dagster_dbt_translator=StakeflowDbtTranslator(),
    select=ML_MODELS,
)
def stakeflow_dbt_ml_assets(context: AssetExecutionContext, dbt: DbtCliResource) -> Iterator[Any]:
    yield from dbt.cli(["build"], context=context).stream()
