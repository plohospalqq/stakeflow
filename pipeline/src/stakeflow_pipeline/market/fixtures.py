"""Load the recorded market responses in tests/fixtures/market instead of calling the APIs.

CI uses this so the price marts and the /prices endpoints have real (recorded) values to test,
through the same parsers and the same append-only store as live ingestion. Share prices are not
part of it: there is no real share data in the repository, only a made-up format sample.

    stakeflow-load-market-fixtures tests/fixtures/market
"""

import json
import sys
from pathlib import Path

import psycopg

from stakeflow_pipeline.market.sources import parse_ecb_csv, parse_eia_page, parse_pink_sheet
from stakeflow_pipeline.market.store import ECB_FX, EIA_BRENT, PINK_SHEET, write_observations
from stakeflow_pipeline.settings import database_conninfo


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("usage: stakeflow-load-market-fixtures <tests/fixtures/market>", file=sys.stderr)
        return 2
    directory = Path(args[0])
    loads = [
        (
            EIA_BRENT,
            "eia_brent",
            parse_eia_page(json.loads((directory / "eia_brent_page.json").read_text()))[0],
        ),
        (ECB_FX, "ecb_fx", parse_ecb_csv((directory / "ecb_exr.csv").read_text())),
        (
            PINK_SHEET,
            "worldbank_pink_sheet",
            parse_pink_sheet((directory / "worldbank_cmo_monthly_trimmed.xlsx").read_bytes()),
        ),
    ]
    with psycopg.connect(database_conninfo()) as conn:
        for table, source, observations in loads:
            run = write_observations(
                conn, table, source, observations, f"fixture:{directory}", None
            )
            print(f"{source:<24} {run.row_count:>5} rows  run={run.run_id or 'unchanged'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
