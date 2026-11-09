"""Write a quarter's live predictions as JSON files: the public, timestamped proof.

    stakeflow-export-predictions --quarter 2026Q4 --out ../predictions

One file per focus company, `<out>/<YYYY>Q<n>/<group_id>.json`, holding the newest live
prediction for that quarter as canonical JSON with both hashes and the hashed inputs. Hashes
are recomputed from the database row before writing, so a row edited behind the trigger's back
cannot be published. An existing file with a different prediction is replaced only with
--force: a re-run must not quietly rewrite a frozen prediction (git keeps the old one anyway).
"""

import argparse
import json
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from stakeflow_pipeline.forecast.hashing import canonical_json
from stakeflow_pipeline.forecast.periods import Quarter
from stakeflow_pipeline.forecast.predictions import Prediction
from stakeflow_pipeline.settings import database_conninfo

LATEST_LIVE_SQL = """
select distinct on (group_id) *
from ml.predictions
where kind = 'live' and quarter_start = %s
order by group_id, predicted_at desc, id
"""


class ExportError(RuntimeError):
    pass


def load_live(conn: psycopg.Connection, quarter: Quarter) -> list[Prediction]:
    with conn.cursor(row_factory=dict_row) as cur:
        rows = cur.execute(LATEST_LIVE_SQL, (quarter.start,)).fetchall()
    predictions = []
    for row in rows:
        prediction = Prediction.from_db(row)
        if (prediction.input_hash, prediction.prediction_hash) != (
            row["input_hash"],
            row["prediction_hash"],
        ):
            raise ExportError(f"prediction {row['id']}: stored hashes do not match its content")
        predictions.append(prediction)
    return predictions


def export_quarter(
    conn: psycopg.Connection, quarter: Quarter, out_dir: Path, force: bool = False
) -> list[Path]:
    predictions = load_live(conn, quarter)
    if not predictions:
        raise ExportError(f"no live predictions for {quarter.label}; run stakeflow-forecast")
    written = []
    for prediction in predictions:
        path = out_dir / quarter.label / f"{prediction.group_id}.json"
        record = prediction.public_record()
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
            if existing.get("prediction_hash") == record["prediction_hash"]:
                continue
            if not force:
                raise ExportError(f"{path} already holds another prediction; use --force")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(canonical_json(record) + "\n", encoding="utf-8")
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="stakeflow-export-predictions", description=__doc__)
    parser.add_argument("--quarter", type=Quarter.parse, required=True, help="e.g. 2026Q4")
    parser.add_argument("--out", type=Path, default=Path("predictions"))
    parser.add_argument("--force", action="store_true", help="replace a different prediction")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    try:
        with psycopg.connect(database_conninfo()) as conn:
            written = export_quarter(conn, args.quarter, args.out, args.force)
    except ExportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for path in written:
        print(f"wrote {path}")
    if not written:
        print(f"{args.quarter.label}: files already up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
