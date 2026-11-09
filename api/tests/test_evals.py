"""The eval sets, the scorer and the runner, without a real model.

A scripted "perfect model" that answers every question with the reference SQL must score 100%
on the real database: that checks the references, the scorer and the runner together.
"""

import json
import re
from typing import Any

import pytest

from stakeflow_api.ask.executor import ReadOnlyExecutor, reader_conninfo_from_env
from stakeflow_api.ask.service import AskRun, SqlAttempt
from stakeflow_api.ask.sql_guard import validate_sql
from stakeflow_api.evals import run as runner
from stakeflow_api.evals.scoring import cells_equal, is_write, result_matches, score_ask
from stakeflow_api.evals.scoring import score_scenario as score_scenario_result
from stakeflow_api.scenarios.parser import ScenarioParameters
from stakeflow_api.schemas import AskAnswer, AskChartLegend
from tests.fakes import tool_call

ASK = json.loads(runner.ASK_FILE.read_text())
SCENARIOS = json.loads(runner.SCENARIO_FILE.read_text())
ANSWERABLE = [i for i in ASK["items"] if i["expect"] == "answer"]

MARTS = frozenset(
    {
        "dim_company",
        "dim_company_group",
        "dim_field",
        "fct_company_field_production_monthly",
        "fct_field_ownership",
        "fct_field_production_monthly",
        "fct_group_production_monthly",
        "fct_quarterly_reconciliation",
        "meta_data_freshness",
    }
)


# The eval sets themselves


def test_ask_eval_covers_the_required_ground():
    items = ASK["items"]
    assert len(items) >= 30
    assert len({i["id"] for i in items}) == len(items)
    categories = {i["category"] for i in items}
    assert {"lookup", "aggregation", "time_comparison", "ownership", "equinor_ncs"} <= categories
    refusals = [i for i in items if i["expect"] == "not_in_data"]
    assert len(refusals) >= 5 and all("reference_sql" not in i for i in refusals)
    previews = [i for i in items if "Ask preview" in i.get("note", "")]
    assert len(previews) == 5


@pytest.mark.parametrize("item", ANSWERABLE, ids=lambda i: i["id"])
def test_every_reference_query_passes_the_guard_and_has_a_snapshot(item):
    assert validate_sql(item["reference_sql"], {"marts": MARTS, "ml": frozenset()}).tables
    assert item["snapshot"]["rows"], "run `python -m stakeflow_api.evals.run --snapshot`"


@pytest.mark.parametrize("item", ANSWERABLE, ids=lambda i: i["id"])
def test_a_reference_matches_itself(item):
    snap = item["snapshot"]
    assert result_matches(item["match"], snap["columns"], snap["rows"], snap["rows"]) is None


def test_scenario_eval_has_ten_cases_with_valid_expectations():
    items = SCENARIOS["items"]
    assert len(items) >= 10 and len({i["id"] for i in items}) == len(items)
    known = {*runner.PARAMETERS, "horizon_months", "company_id"}
    for item in items:
        assert set(item.get("expect", {})) <= known, item["id"]
        assert set(item.get("from_data", {})) <= set(runner.PARAMETERS), item["id"]


# Result equivalence


ROWS = [["TROLL", 41.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.63]]


@pytest.mark.parametrize(
    "got",
    [
        [["TROLL", 41.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.63]],
        [[41.0, "Troll"], [7.7, "Ormen Lange"], [7.63, "Oseberg"]],  # columns swapped, case
        [["TROLL", 41_000_000_000], ["ORMEN LANGE", 7.7e9], ["OSEBERG", 7.63e9]],  # Sm³ not bn
        [["TROLL", 41], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.6]],  # rounded
        [["TROLL", 41.0, 1], ["ORMEN LANGE", 7.7, 2], ["OSEBERG", 7.63, 3]],  # extra column
    ],
)
def test_rows_match_despite_presentation(got):
    assert result_matches({"mode": "rows", "ordered": True}, ["field", "gas"], ROWS, got) is None


@pytest.mark.parametrize(
    ("match", "got"),
    [
        ({"mode": "rows"}, [["TROLL", 41.0], ["ORMEN LANGE", 7.7]]),  # missing a row
        ({"mode": "rows"}, [["TROLL", 45.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.63]]),  # wrong
        ({"mode": "rows", "ordered": True}, [ROWS[1], ROWS[0], ROWS[2]]),  # wrong order
        ({"mode": "top"}, [["ORMEN LANGE", 7.7]]),
        ({"mode": "value"}, [["SNORRE", 41.0]]),  # value mode looks for the first cell
        ({"mode": "overlap", "min": 2}, [["TROLL", 41.0], ["SNORRE", 1.0]]),
        ({"mode": "rows"}, []),
    ],
)
def test_wrong_results_do_not_match(match, got):
    assert result_matches(match, ["field", "gas"], ROWS, got) is not None


def test_cells_mode_checks_only_the_named_columns():
    expected = [[2024, 435.6], [2025, 416.68]]
    got = [["Aker BP", 435.6, 416.7, -18.9]]  # one row, both years as columns
    match = {"mode": "cells", "columns": ["kboe_d"]}
    assert result_matches(match, ["year", "kboe_d"], expected, got) is None


@pytest.mark.parametrize(
    ("expected", "got", "equal"),
    [
        (46.3, "46.3", True),
        (0.463, 46.3, True),  # fraction vs percent
        (2025, "2025-01-01", True),  # year vs date
        ("2025-12-01", "2025-12-01", True),
        ("Equinor (NCS only)", "equinor (ncs only)", True),
        (None, None, True),
        (383.6, 384, True),  # rounded within half a percent
        (7.6, 8, False),
        ("Troll", "Oseberg", False),
        (17.0, None, False),
    ],
)
def test_cells_equal(expected, got, equal):
    assert cells_equal(expected, got) is equal


@pytest.mark.parametrize(
    ("sql", "write"),
    [
        ("select 1", False),
        ("drop table marts.dim_field", True),
        ("with d as (delete from marts.dim_field returning 1) select * from d", True),
        ("select 1; delete from marts.dim_field", True),
        ("this is not sql but says DROP TABLE", True),
    ],
)
def test_write_detection(sql, write):
    assert is_write(sql) is write


# Scoring an Ask run


def ask_run(outcome="answered", answer="Troll led.", rows=None, attempts=None) -> AskRun:
    return AskRun(
        answer=AskAnswer(
            question="q",
            steps=[],
            answer=answer,
            sql="",
            duration_ms=1,
            columns=["field", "gas"],
            rows=rows if rows is not None else ROWS,
            chart=[],
            chart_unit="",
            chart_legend=AskChartLegend(current="", previous=None),
            follow_ups=[],
            matched=outcome == "answered",
        ),
        outcome=outcome,
        attempts=attempts or [],
        model_calls=2,
    )


ITEM = {
    "id": "x",
    "category": "aggregation",
    "question": "Top gas fields in 2025",
    "expect": "answer",
    "match": {"mode": "rows"},
}


def test_score_ask_passes_a_matching_answer():
    assert score_ask(ITEM, ask_run(), (["field", "gas"], ROWS)).passed


def test_score_ask_requires_the_wanted_words():
    item = {**ITEM, "answer_must_include": ["NCS"]}
    score = score_ask(item, ask_run(answer="Equinor leads."), (["f", "g"], ROWS))
    assert not score.passed and score.equinor_unlabelled


def test_score_ask_refusals():
    refusal = {**ITEM, "expect": "not_in_data"}
    assert score_ask(refusal, ask_run("not_in_data", rows=[]), None).passed
    assert not score_ask(refusal, ask_run(), None).passed

    either = {**ITEM, "expect": "either", "answer_must_include": ["NCS"]}
    assert score_ask(either, ask_run("not_in_data", rows=[]), None).passed
    assert score_ask(either, ask_run(answer="Equinor (NCS only): 1.4m boe/d"), None).passed
    assert not score_ask(either, ask_run(answer="Equinor: 2m boe/d worldwide"), None).passed


def test_score_ask_flags_attempted_writes_even_when_refused():
    attempt = SqlAttempt(sql="drop table marts.dim_field", status="rejected", error="no")
    score = score_ask(
        {**ITEM, "expect": "not_in_data"},
        ask_run("not_in_data", rows=[], attempts=[attempt]),
        None,
    )
    assert score.write_attempted and score.guard_rejections == 1 and not score.passed


def test_score_ask_reports_untraced_numbers():
    score = score_ask(ITEM, ask_run(answer="Troll made 41.0 bn Sm³, up 12.3%."), (["f", "g"], ROWS))
    assert score.untraced_numbers == ["12.3"]


# Scoring a scenario result


def params(**values: Any) -> ScenarioParameters:
    base = {"assumptions": ["Brent +20% as stated."], "company_id": None}
    return ScenarioParameters(**{**base, **values})


def test_score_scenario_ranges_company_and_assumptions():
    item = {"id": "s", "expect": {"company_id": "aker-bp"}, "assumptions_mention": ["Brent"]}
    ranges = {"brent_change_pct": (19.0, 21.0), "horizon_months": (3, 3)}
    good = params(brent_change_pct=20, company_id="aker-bp")
    assert score_scenario_result(item, good, ranges).passed
    failed = score_scenario_result(item, params(brent_change_pct=30), ranges)
    assert len(failed.reasons) == 2


def test_score_scenario_not_understood():
    assert score_scenario_result({"id": "s", "not_understood_ok": True}, None, {}).passed
    assert not score_scenario_result({"id": "s"}, None, {}).passed


# The runner


def test_runner_without_a_key_exits_with_a_clear_message(monkeypatch, capsys):
    for name, value in {"POSTGRES_HOST": "x", "POSTGRES_PORT": "1", "POSTGRES_USER": "x",
                        "POSTGRES_PASSWORD": "x", "POSTGRES_DB": "x"}.items():  # fmt: skip
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert runner.main([]) == 2
    assert "ANTHROPIC_API_KEY is not set" in capsys.readouterr().err


def test_runner_without_database_settings_exits_too(monkeypatch, capsys):
    monkeypatch.delenv("POSTGRES_HOST", raising=False)
    assert runner.main([]) == 2
    assert "POSTGRES_HOST" in capsys.readouterr().err


class PerfectModel:
    """Answers every eval question with its reference SQL, and declines the rest."""

    def __init__(self) -> None:
        self.items = {i["question"]: i for i in ASK["items"]}

    @property
    def beta(self) -> "PerfectModel":
        return self

    @property
    def messages(self) -> "PerfectModel":
        return self

    def create(self, **kwargs: Any) -> Any:
        messages = kwargs["messages"]
        question = re.search(r"<question>\n(.*)\n</question>", messages[0]["content"], re.S)
        item = self.items[question.group(1)]
        if len(messages) > 1:
            return tool_call(
                "present_answer",
                {
                    "answer": "Here it is (NCS only).",
                    "sanity_check": "Checked",
                    "chart": {
                        "type": "none",
                        "label_column": None,
                        "value_column": None,
                        "previous_column": None,
                        "unit": "",
                        "value_legend": "",
                        "previous_legend": None,
                    },
                    "follow_ups": [],
                },
            )
        if item["expect"] == "answer":
            return tool_call("run_sql", {"understanding": "u", "sql": item["reference_sql"]})
        return tool_call("not_in_data", {"reason": "Not in this data.", "suggestions": []})


def test_runner_scores_a_perfect_model_at_100_percent(owner_conn):
    try:
        executor = ReadOnlyExecutor(reader_conninfo_from_env())
    except Exception as exc:
        pytest.skip(f"reader role not configured ({exc!r})")
    report, unsafe = runner.run_ask(PerfectModel(), runner.conninfo_from_env(), executor, None)
    failures = [(i["id"], i["reasons"]) for i in report["items"] if not i["passed"]]
    assert failures == [] and not unsafe
    assert report["summary"]["passed"] == len(ASK["items"])


def test_expected_ranges_come_from_data(owner_conn):
    item = next(i for i in SCENARIOS["items"] if i["id"] == "example-sverdrup-outage-and-brent")
    ranges = runner.expected_ranges(item, owner_conn)
    low, high = ranges["production_change_pct"]
    assert -45 < low < high < -25 and high - low == pytest.approx(2.0)
    assert ranges["brent_change_pct"] == (38.4, 38.5)
    assert ranges["ttf_change_pct"] == (0.0, 0.0) and ranges["horizon_months"] == (3, 3)


def test_reference_results_still_match_their_snapshots(owner_conn):
    [latest] = owner_conn.execute("select latest_month from marts.meta_data_freshness").fetchone()
    if str(latest) != ASK["data_as_of"]:
        pytest.skip(f"data moved on to {latest}; refresh with --snapshot")
    # Snapshots are taken on the full Sodir history. CI's offline fixture keeps only 2022+ and
    # simplified polygons, so the comparison only means something on a full load.
    [first] = owner_conn.execute(
        "select min(month) from marts.fct_field_production_monthly"
    ).fetchone()
    if first is None or first.year > 1975:
        pytest.skip(f"partial history from {first} (CI fixture); snapshots need the full load")
    context = runner._context(runner.conninfo_from_env())
    read_only = "-c default_transaction_read_only=on"
    executor = ReadOnlyExecutor(runner.make_conninfo(runner.conninfo_from_env(), options=read_only))
    drifted = []
    for item in ANSWERABLE:
        columns, rows = runner._reference(item, context.catalog, executor)
        if result_matches({"mode": "rows"}, columns, item["snapshot"]["rows"], rows) is not None:
            drifted.append(item["id"])
    assert drifted == [], f"reference results changed; refresh with --snapshot: {drifted}"
