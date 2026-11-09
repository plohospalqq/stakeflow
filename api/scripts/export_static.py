"""Export the API's responses as JSON files for the static GitHub Pages demo.

The frontend's static mode (VITE_DATA_SOURCE=static, frontend/src/api/static.ts) maps every API
path it calls to one of these files, so the demo shows the real numbers without a backend.

    # against the API from `make up` (or any running API with --api-url)
    uv run python scripts/export_static.py ../frontend/public/data

Every file is one endpoint's exact response. Monthly series hold a fixed window of months that
covers every range the UI requests; meta/snapshot.json records where each window starts, so the
frontend refuses a range it cannot answer instead of showing a cut series as complete.
"""

import argparse
import json
import re
import shutil
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx

# Company pages and the overview use the API default (36 months) or less
COMPANY_WINDOW_MONTHS = 36
# A field page shows the whole history, capped at 300 months back (useFieldHistory)
FIELD_WINDOW_MONTHS = 301
# The API's maximum page size; the static lists must hold every row
LIST_LIMIT = 500

# Ids become file paths: only accept the shapes the API itself produces
COMPANY_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def add_months(month: date, n: int) -> date:
    total = month.year * 12 + month.month - 1 + n
    return date(total // 12, total % 12 + 1, 1)


class Exporter:
    def __init__(self, client: httpx.Client, out: Path) -> None:
        self.client = client
        self.out = out
        self.files = 0
        self.bytes = 0

    def save(self, file: str, body: Any) -> None:
        path = self.out / file
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        self.files += 1
        self.bytes += len(text.encode())

    def export(self, path: str, file: str, **params: str | int | bool) -> Any:
        response = self.client.get(path, params=params)
        response.raise_for_status()
        body = response.json()
        self.save(file, body)
        return body

    def full_list(self, path: str, file: str, **params: str | int | bool) -> list[dict]:
        rows = self.export(path, file, limit=LIST_LIMIT, **params)
        if len(rows) >= LIST_LIMIT:
            raise SystemExit(f"{path} {params}: {len(rows)} rows fill a page; the list is cut")
        return rows


def export_all(client: httpx.Client, out: Path, source: str) -> Exporter:
    ex = Exporter(client, out)
    freshness = ex.export("/meta/freshness", "meta/freshness.json")
    ex.export("/summary", "meta/summary.json")
    latest = date.fromisoformat(freshness["latestMonth"])
    company_start = add_months(latest, -(COMPANY_WINDOW_MONTHS - 1)).isoformat()
    field_start = add_months(latest, -(FIELD_WINDOW_MONTHS - 1)).isoformat()

    focus = ex.export("/companies", "companies/focus.json", focus=True)
    producing = ex.full_list("/companies", "companies/all.json")
    fields = ex.full_list("/fields", "fields/all.json")
    ex.export("/fields/geojson", "fields/geojson.json")

    # Every group a page can link to: the company lists, plus every current owner of a field
    group_ids = {c["id"] for c in focus + producing}
    for field in fields:
        field_id = int(field["id"])
        detail = ex.export(f"/fields/{field_id}", f"fields/{field_id}/detail.json")
        ex.export(f"/fields/{field_id}/ownership", f"fields/{field_id}/ownership.json")
        ex.export(
            f"/fields/{field_id}/production",
            f"fields/{field_id}/production.json",
            start=field_start,
        )
        group_ids |= {o["groupId"] for o in detail["currentOwners"]}

    for group_id in sorted(group_ids):
        if not COMPANY_ID.match(group_id):
            raise SystemExit(f"unexpected company id {group_id!r}; refusing to use it as a path")
        base = f"companies/{group_id}"
        ex.export(f"/companies/{group_id}", f"{base}/detail.json")
        ex.export(
            f"/companies/{group_id}/production", f"{base}/production.json", start=company_start
        )
        ex.export(f"/companies/{group_id}/fields", f"{base}/fields.json", start=company_start)
        ex.export(f"/companies/{group_id}/quarters", f"{base}/quarters.json")
        ex.full_list("/fields", f"fields/owner/{group_id}.json", owner=group_id)

    ex.save(
        "meta/snapshot.json",
        {
            "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
            "latestMonth": latest.isoformat(),
            "source": source,
            "seriesStart": {"company": company_start, "field": field_start},
        },
    )
    return ex


def prepare_out_dir(out: Path) -> None:
    """Start from an empty directory so fields that left the data do not linger. Only ever
    deletes a directory that holds a previous export."""
    if out.exists() and any(out.iterdir()):
        if not (out / "meta" / "snapshot.json").is_file():
            raise SystemExit(f"{out} is not empty and holds no previous export; not touching it")
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("out", type=Path, help="output directory, e.g. ../frontend/public/data")
    parser.add_argument("--api-url", default="http://localhost:8000", help="a running API")
    parser.add_argument(
        "--source",
        choices=["live", "ci-fixture"],
        default="live",
        help="where the warehouse came from: the Sodir API or the offline CI snapshot",
    )
    args = parser.parse_args()

    prepare_out_dir(args.out)
    with httpx.Client(base_url=args.api_url, timeout=60) as client:
        ex = export_all(client, args.out, args.source)
    print(f"wrote {ex.files} files, {ex.bytes / 1e6:.1f} MB, to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
