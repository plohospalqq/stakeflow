"""Run the LLM evals against the real model and the real database, and print a scorecard.

    uv run python -m stakeflow_api.evals.run                    # both suites
    uv run python -m stakeflow_api.evals.run --suite ask --ids lookup-troll-discovery
    uv run python -m stakeflow_api.evals.run --snapshot         # refresh reference results only

Needs ANTHROPIC_API_KEY (every item calls the model, so a full run costs real money: roughly
three model calls per Ask item and two per scenario item), the POSTGRES_* variables and
STAKEFLOW_READER_PASSWORD. Model SQL runs exactly as in the API: through the guard and as the
read-only role. Results go to evals/results/<timestamp>.json (git-ignored).

Exit code: 0 done, 1 a safety check failed (the model tried to write) or a reference query is
broken, 2 not configured.
"""

import argparse
import json
import os
import sys
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict
from datetime import UTC, date, datetime
from pathlib import Path
from time import monotonic
from typing import Any

import psycopg
from psycopg.conninfo import make_conninfo

from stakeflow_api.ask.catalog import Catalog, load_catalog
from stakeflow_api.ask.executor import (
    QueryFailed,
    ReaderNotConfigured,
    ReadOnlyExecutor,
    reader_conninfo_from_env,
)
from stakeflow_api.ask.service import AskContext, answer_question
from stakeflow_api.ask.sql_guard import UnsafeSQL, validate_sql
from stakeflow_api.db import conninfo_from_env
from stakeflow_api.evals.scoring import AskScore, ScenarioScore, score_ask, score_scenario
from stakeflow_api.llm import EFFORT, MODEL, LLMUnavailable, MessagesClient, make_client
from stakeflow_api.scenarios.data import MartsScenarioData
from stakeflow_api.scenarios.parser import (
    DEFAULT_HORIZON_MONTHS,
    ScenarioNotUnderstood,
    ScenarioParameters,
    ScenarioParseRequest,
    parse_scenario,
)

EVALS_DIR = Path(__file__).resolve().parents[3] / "evals"
ASK_FILE = EVALS_DIR / "ask_eval.json"
SCENARIO_FILE = EVALS_DIR / "scenario_eval.json"
RESULTS_DIR = EVALS_DIR / "results"

PARAMETERS = ("brent_change_pct", "ttf_change_pct", "production_change_pct", "eurusd_change_pct")

# Independent of scenarios/data.py on purpose: a field's share of a company's net production
# over the 12 latest months with data
FIELD_SHARE_SQL = """
with period as (
    select latest_month - interval '11 months' as first_month, latest_month as last_month
    from marts.meta_data_freshness
)
select 100 * sum(cf.oe_sm3) filter (where f.name = %(field)s) / sum(cf.oe_sm3)
from marts.fct_company_field_production_monthly as cf
join marts.dim_field as f using (field_id)
cross join period
where cf.group_id = %(company)s and cf.month between period.first_month and period.last_month
"""


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        owner = conninfo_from_env()
    except KeyError as exc:
        return _not_configured(f"{exc.args[0]} is not set (POSTGRES_* point at the database).")

    if args.snapshot:
        return snapshot(owner)

    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return _not_configured(
            "ANTHROPIC_API_KEY is not set. The evals call the real model (it costs money), so "
            "nothing was run. Set the key and run again, or use --snapshot to refresh the "
            "reference results without the model."
        )
    try:
        reader = ReadOnlyExecutor(reader_conninfo_from_env())
    except ReaderNotConfigured as exc:
        return _not_configured(str(exc))

    client = make_client()
    ids = set(args.ids.split(",")) if args.ids else None
    report: dict[str, Any] = {
        "started_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model": MODEL,
        "effort": EFFORT,
    }
    failed_safety = False
    if args.suite in ("ask", "all"):
        report["ask"], ask_unsafe = run_ask(client, owner, reader, ids)
        failed_safety |= ask_unsafe
    if args.suite in ("scenario", "all"):
        report["scenario"] = run_scenarios(client, owner, ids)

    RESULTS_DIR.mkdir(exist_ok=True)
    out = Path(args.out) if args.out else RESULTS_DIR / f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    print(f"\nResults written to {out}")
    return 1 if failed_safety else 0


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m stakeflow_api.evals.run")
    parser.add_argument("--suite", choices=("ask", "scenario", "all"), default="all")
    parser.add_argument("--ids", help="comma-separated item ids to run")
    parser.add_argument("--out", help="where to write the JSON results")
    parser.add_argument(
        "--snapshot",
        action="store_true",
        help="re-run the reference queries and store their results in ask_eval.json (no model)",
    )
    return parser.parse_args(argv)


def _not_configured(message: str) -> int:
    print(f"evals not run: {message}", file=sys.stderr)
    return 2


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _context(owner: str) -> AskContext:
    with psycopg.connect(owner) as conn:
        catalog = load_catalog(conn)
        row = conn.execute("select latest_month from marts.meta_data_freshness").fetchone()
    return AskContext(catalog=catalog, latest_month=row[0] if row else None)


def _reference(item: dict[str, Any], catalog: Catalog, executor: ReadOnlyExecutor) -> Any:
    """The reference result, run through the same guard and executor as the model's SQL."""
    guarded = validate_sql(item["reference_sql"], catalog.allowed_tables)
    result = executor(guarded.sql)
    return result.columns, result.rows


# Ask


def run_ask(
    client: MessagesClient, owner: str, executor: ReadOnlyExecutor, ids: set[str] | None
) -> tuple[dict[str, Any], bool]:
    suite = _load(ASK_FILE)
    items = [i for i in suite["items"] if ids is None or i["id"] in ids]
    context = _context(owner)
    print(
        f"Ask eval: {len(items)} questions, {MODEL} (effort {EFFORT}), data through "
        f"{context.latest_month}"
    )

    records, scores, broken_references = [], [], []
    for n, item in enumerate(items, 1):
        reference = None
        if item.get("reference_sql"):
            try:
                reference = _reference(item, context.catalog, executor)
            except (UnsafeSQL, QueryFailed) as exc:
                broken_references.append(item["id"])
                print(f"  reference query for {item['id']} is broken: {exc}")

        started = monotonic()
        try:
            run = answer_question(
                item["question"],
                client=client,
                context=context,
                run_query=executor,
                today=date.today(),
            )
        except LLMUnavailable as exc:
            score = AskScore(item["id"], item["category"], False, [f"model unavailable: {exc}"])
            records.append({**asdict(score), "question": item["question"]})
            scores.append(score)
            print(f"[{n:2}/{len(items)}] FAIL {item['id']}: {exc}")
            continue
        seconds = monotonic() - started

        score = score_ask(item, run, reference)
        scores.append(score)
        records.append(
            {
                **asdict(score),
                "question": item["question"],
                "outcome": run.outcome,
                "model_calls": run.model_calls,
                "seconds": round(seconds, 1),
                "answer": run.answer.answer,
                "sql": run.answer.sql,
                "attempts": [asdict(a) for a in run.attempts],
                "columns": run.answer.columns,
                "rows": run.answer.rows[:20],
                "reference": (
                    {"columns": reference[0], "rows": reference[1][:20]} if reference else None
                ),
            }
        )
        status = "PASS" if score.passed else "FAIL"
        why = f"  ({'; '.join(score.reasons)})" if score.reasons else ""
        print(f"[{n:2}/{len(items)}] {status} {item['id']} {seconds:.1f}s{why}")

    summary = _ask_scorecard(scores)
    summary["broken_references"] = broken_references
    unsafe = any(s.write_attempted for s in scores) or bool(broken_references)
    return {"summary": summary, "items": records}, unsafe


def _ask_scorecard(scores: list[AskScore]) -> dict[str, Any]:
    by_category: dict[str, list[int]] = {}
    for s in scores:
        passed, total = by_category.setdefault(s.category, [0, 0])
        by_category[s.category] = [passed + s.passed, total + 1]

    print("\nAsk scorecard")
    print(f"  {'category':<18}{'pass':>6}{'total':>7}")
    for category, (passed, total) in by_category.items():
        print(f"  {category:<18}{passed:>6}{total:>7}")
    passed = sum(s.passed for s in scores)
    share = 100 * passed / len(scores) if scores else 0
    print(f"  {'total':<18}{passed:>6}{len(scores):>7}   {share:.0f}%")

    safety = {
        "writes_attempted": sum(s.write_attempted for s in scores),
        "guard_rejections": sum(s.guard_rejections for s in scores),
        "answers_with_untraced_numbers": sum(bool(s.untraced_numbers) for s in scores),
        "equinor_unlabelled": sum(s.equinor_unlabelled for s in scores),
    }
    print(
        "  safety: writes attempted {writes_attempted} · guard rejections {guard_rejections} · "
        "answers with untraced numbers {answers_with_untraced_numbers} · Equinor without NCS "
        "label {equinor_unlabelled}".format(**safety)
    )
    for s in scores:
        if not s.passed:
            print(f"  FAIL {s.id}: {'; '.join(s.reasons)}")
    return {"passed": passed, "total": len(scores), "by_category": by_category, "safety": safety}


# Scenarios


def run_scenarios(client: MessagesClient, owner: str, ids: set[str] | None) -> dict[str, Any]:
    suite = _load(SCENARIO_FILE)
    items = [i for i in suite["items"] if ids is None or i["id"] in ids]
    print(f"\nScenario eval: {len(items)} cases")

    records, scores = [], []
    with psycopg.connect(owner, autocommit=True) as conn:
        data = MartsScenarioData(conn)
        for n, item in enumerate(items, 1):
            ranges = expected_ranges(item, conn)
            request = ScenarioParseRequest(
                text=item["text"],
                company_id=item.get("company_id"),
                reference=item.get("reference"),
            )
            result: ScenarioParameters | None
            try:
                result = parse_scenario(request, client=client, data=data)
            except ScenarioNotUnderstood:
                result = None
            except LLMUnavailable as exc:
                score = ScenarioScore(item["id"], False, [f"model unavailable: {exc}"])
                scores.append(score)
                records.append(asdict(score))
                continue
            score = score_scenario(item, result, ranges)
            scores.append(score)
            records.append(
                {
                    **asdict(score),
                    "text": item["text"],
                    "expected": ranges,
                    "result": result.model_dump() if result else None,
                }
            )
            status = "PASS" if score.passed else "FAIL"
            why = f"  ({'; '.join(score.reasons)})" if score.reasons else ""
            print(f"[{n:2}/{len(items)}] {status} {item['id']}{why}")

    passed = sum(s.passed for s in scores)
    print(f"\nScenario scorecard: {passed}/{len(scores)} passed")
    return {"summary": {"passed": passed, "total": len(scores)}, "items": records}


Ranges = dict[str, tuple[float, float]]


def expected_ranges(item: dict[str, Any], conn: psycopg.Connection) -> Ranges:
    """Unlisted prices and production must stay at 0, an unlisted horizon at the default."""
    ranges: Ranges = {key: (0.0, 0.0) for key in PARAMETERS}
    ranges["horizon_months"] = (DEFAULT_HORIZON_MONTHS, DEFAULT_HORIZON_MONTHS)
    for key, value in item.get("expect", {}).items():
        if key != "company_id":
            ranges[key] = (float(value[0]), float(value[1]))
    for key, spec in item.get("from_data", {}).items():
        row = conn.execute(FIELD_SHARE_SQL, {"field": spec["field"], "company": spec["company"]})
        [share] = row.fetchone() or [None]
        if share is None:
            raise ValueError(f"{item['id']}: no data for {spec['field']} / {spec['company']}")
        value = float(share) * spec["change_pct"] / 100 * spec["months"] / spec["horizon"]
        ranges[key] = (value - spec["tolerance"], value + spec["tolerance"])
    return ranges


# Snapshots


def snapshot(owner: str) -> int:
    """Store each reference query's current result in ask_eval.json, for review and drift checks."""
    read_only = make_conninfo(
        owner, options="-c default_transaction_read_only=on -c statement_timeout=10000"
    )
    context = _context(owner)
    executor = ReadOnlyExecutor(read_only)
    suite = _load(ASK_FILE)
    broken = 0
    for item in suite["items"]:
        if not item.get("reference_sql"):
            continue
        try:
            columns, rows = _reference(item, context.catalog, executor)
        except (UnsafeSQL, QueryFailed) as exc:
            broken += 1
            print(f"BROKEN {item['id']}: {exc}")
            continue
        item["snapshot"] = {"columns": columns, "rows": rows}
        print(f"ok {item['id']}: {len(rows)} rows")
    suite["data_as_of"] = str(context.latest_month)
    ASK_FILE.write_text(json.dumps(suite, indent=2, ensure_ascii=False) + "\n")
    counts = Counter(i["category"] for i in suite["items"])
    print(f"{sum(counts.values())} items: {dict(counts)}")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
