"""CLI: download Sodir layers into the raw schema.

    stakeflow-ingest                 # all layers
    stakeflow-ingest field profiles  # selected layers

Dagster (Phase 1, step 2) calls the same functions; this CLI is for manual runs and debugging.
"""

import sys

import psycopg

from stakeflow_pipeline.raw_store import RunResult, write_snapshot
from stakeflow_pipeline.settings import database_conninfo, sodir_base_url
from stakeflow_pipeline.sodir.client import SodirClient, make_http_client
from stakeflow_pipeline.sodir.layers import LAYERS, LAYERS_BY_NAME, Layer


def ingest_layer(client: SodirClient, conn: psycopg.Connection, layer: Layer) -> RunResult:
    expected = client.count(layer)
    return write_snapshot(conn, layer, client.iter_pages(layer), expected)


def main(argv: list[str] | None = None) -> int:
    names = sys.argv[1:] if argv is None else argv
    unknown = [n for n in names if n not in LAYERS_BY_NAME]
    if unknown:
        print(f"unknown layers: {unknown}. Known: {list(LAYERS_BY_NAME)}", file=sys.stderr)
        return 2
    layers = [LAYERS_BY_NAME[n] for n in names] if names else list(LAYERS)

    with (
        make_http_client(sodir_base_url()) as http,
        psycopg.connect(database_conninfo()) as conn,
    ):
        client = SodirClient(http)
        for layer in layers:
            result = ingest_layer(client, conn, layer)
            print(f"{result.layer:<28} {result.row_count:>7} rows  run={result.run_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
