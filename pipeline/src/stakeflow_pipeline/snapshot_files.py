"""Load a raw snapshot from gzipped JSON files instead of the live Sodir API.

CI uses this to build the whole warehouse offline from `tests/fixtures/ci_snapshot/`, through
the same `write_snapshot` path as real ingestion.

    stakeflow-load-snapshot tests/fixtures/ci_snapshot
"""

import gzip
import json
import sys
from pathlib import Path

import psycopg

from stakeflow_pipeline.raw_store import write_snapshot
from stakeflow_pipeline.settings import database_conninfo
from stakeflow_pipeline.sodir.client import Feature
from stakeflow_pipeline.sodir.layers import LAYERS_BY_NAME


def read_features(path: Path) -> list[Feature]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [Feature.model_validate(item) for item in json.load(f)]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("usage: stakeflow-load-snapshot <dir with <layer>.json.gz files>", file=sys.stderr)
        return 2
    directory = Path(args[0])
    with psycopg.connect(database_conninfo()) as conn:
        for path in sorted(directory.glob("*.json.gz")):
            layer = LAYERS_BY_NAME[path.name.removesuffix(".json.gz")]
            features = read_features(path)
            result = write_snapshot(conn, layer, [features], expected_count=len(features))
            print(f"{result.layer:<28} {result.row_count:>7} rows  run={result.run_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
