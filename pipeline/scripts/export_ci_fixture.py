"""Export a small, offline copy of the latest raw snapshot for CI.

Run against a database that holds a real ingestion (make up && make refresh):

    uv run --env-file ../.env python scripts/export_ci_fixture.py tests/fixtures/ci_snapshot

Keeps every field and company but trims history to 2022+ and simplifies polygons, so dbt and
the API tests run on real numbers (Aker BP Q2 2026 reconciliation included) in seconds.
"""

import gzip
import json
import sys
from pathlib import Path

import psycopg

from stakeflow_pipeline.settings import database_conninfo

SINCE_YEAR = 2022
LATEST = """(select run_id from raw.ingestion_runs
             where layer = %s and finished_at is not null order by finished_at desc limit 1)"""

QUERIES: dict[str, str] = {
    "company": f"select attributes, null from raw.sodir_company where ingestion_run_id = {LATEST}",
    "field": f"""
        select attributes,
               st_asgeojson(
                   st_simplifypreservetopology(st_geomfromgeojson(geometry::text), 0.003), 5
               )::jsonb
        from raw.sodir_field where ingestion_run_id = {LATEST}""",
    "field_operator_hst": f"""
        select attributes, null from raw.sodir_field_operator_hst
        where ingestion_run_id = {LATEST}""",
    "field_licensee_hst": f"""
        select attributes, null from raw.sodir_field_licensee_hst
        where ingestion_run_id = {LATEST}
          and coalesce((attributes->>'fldLicenseeTo')::bigint, 253402214400000)
              >= extract(epoch from make_date({SINCE_YEAR}, 1, 1)) * 1000""",
    "profiles": f"""
        select (select jsonb_object_agg(k, v) from jsonb_each(attributes) as e(k, v)
                where k like 'prf%%' and k not in ('prfInvestmentsMillNOK')), null
        from raw.sodir_profiles
        where ingestion_run_id = {LATEST}
          and attributes->>'prfPeriod' = 'month'
          and attributes->>'prfInformationCarrierKind' = 'FIELD'
          and (attributes->>'prfYear')::int >= {SINCE_YEAR}""",
}


def main() -> int:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(database_conninfo()) as conn:
        for layer, query in QUERIES.items():
            rows = conn.execute(query, (layer,)).fetchall()
            features = [{"properties": attrs, "geometry": geom} for attrs, geom in rows]
            path = out / f"{layer}.json.gz"
            with gzip.open(path, "wt", encoding="utf-8") as f:
                json.dump(features, f, separators=(",", ":"))
            print(f"{layer:<20} {len(features):>6} rows  {path.stat().st_size / 1024:>7.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
