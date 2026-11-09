"""The Ask workflow with a scripted model and a fake database. No network, no DB."""

import json
from datetime import date

import pytest

from stakeflow_api.ask.catalog import Catalog, Column, Table
from stakeflow_api.ask.executor import QueryFailed, QueryResult, QueryTimedOut
from stakeflow_api.ask.service import AskContext, answer_question, label_equinor
from stakeflow_api.llm import FALLBACK_BETA, MODEL
from tests.fakes import FakeAnthropic, last_tool_result, refusal, text_reply, tool_call

CATALOG = Catalog(
    (
        Table(
            "marts",
            "dim_field",
            "Fields.",
            (Column("field_id", "integer", "Sodir field id."), Column("name", "text", "")),
        ),
        Table(
            "marts",
            "fct_field_production_monthly",
            "Net production per field and month.",
            (
                Column("field_id", "integer", ""),
                Column("month", "date", "First day of the month."),
                Column("gas_sm3", "numeric", "Net gas in Sm³."),
            ),
        ),
        Table(
            "marts",
            "dim_company_group",
            "Companies.",
            (Column("group_id", "text", ""), Column("display_name", "text", "")),
        ),
    )
)
CONTEXT = AskContext(catalog=CATALOG, latest_month=date(2026, 8, 1))
TODAY = date(2026, 11, 9)

GAS_SQL = (
    "SELECT f.name AS field, round(SUM(p.gas_sm3) / 1e9, 1) AS gas_bn_sm3 "
    "FROM marts.fct_field_production_monthly p JOIN marts.dim_field f USING (field_id) "
    "WHERE p.month BETWEEN DATE '2025-01-01' AND DATE '2025-12-01' "
    "GROUP BY f.name ORDER BY gas_bn_sm3 DESC LIMIT 3"
)
GAS_ROWS = QueryResult(
    columns=["field", "gas_bn_sm3"],
    rows=[["TROLL", 41.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.6]],
    duration_ms=4,
    truncated=False,
)
RUN_GAS = {"understanding": "Fields ranked by 2025 gas output", "sql": GAS_SQL}
PRESENT_GAS = {
    "answer": "Troll produced 41.0 billion Sm³ of gas in 2025, far ahead of Ormen Lange (7.7).",
    "sanity_check": "Gas in billion Sm³ of gas, not oil equivalent",
    "chart": {
        "type": "bar",
        "label_column": "field",
        "value_column": "gas_bn_sm3",
        "previous_column": None,
        "unit": "bn Sm³",
        "value_legend": "2025",
        "previous_legend": None,
    },
    "follow_ups": ["Top 10 oil fields in 2025", "Who owns Troll?", "Troll gas by year", "extra"],
}


class FakeDB:
    """Records the SQL it was asked to run and plays back results or errors."""

    def __init__(self, *outcomes: QueryResult | Exception) -> None:
        self.outcomes = list(outcomes)
        self.ran: list[str] = []

    def __call__(self, sql: str) -> QueryResult:
        self.ran.append(sql)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def ask(client, db, question="Top 3 gas fields in 2025"):
    return answer_question(question, client=client, context=CONTEXT, run_query=db, today=TODAY)


def test_answers_with_rows_chart_steps_and_follow_ups():
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS))
    db = FakeDB(GAS_ROWS)

    run = ask(client, db)
    answer = run.answer

    assert run.outcome == "answered" and answer.matched
    assert answer.columns == ["field", "gas_bn_sm3"]
    assert answer.rows == [["TROLL", 41.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.6]]
    assert answer.duration_ms == 4
    assert answer.chart[0].model_dump() == {
        "label": "TROLL",
        "value": 41.0,
        "previous": None,
    }
    assert answer.chart_type == "bar" and answer.chart_unit == "bn Sm³"
    assert answer.chart_legend.current == "2025" and answer.chart_legend.previous is None
    assert answer.follow_ups == PRESENT_GAS["follow_ups"][:3]
    assert [s.label for s in answer.steps] == [
        "Understood question",
        "Found 2 tables",
        "Ran query",
        "Sanity check",
    ]
    assert answer.steps[0].detail == "Fields ranked by 2025 gas output"
    assert answer.steps[1].detail == "dim_field, fct_field_production_monthly"
    assert answer.steps[2].detail == "4 ms · 3 rows"
    assert "all 2 numbers in the answer are in the result" in answer.steps[3].detail


def test_request_uses_model_effort_caching_fallback_and_strict_tools():
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS))
    ask(client, FakeDB(GAS_ROWS))

    first = client.calls[0]
    assert first["model"] == MODEL == "claude-opus-5-5"
    assert first["output_config"] == {"effort": "medium"}
    assert first["betas"] == [FALLBACK_BETA] and first["fallbacks"] == "default"
    assert first["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    assert "thinking" not in first  # Opus 5.5 always thinks; effort is the dial
    assert [t["name"] for t in first["tools"]] == ["run_sql", "not_in_data", "present_answer"]
    for tool in first["tools"]:
        assert tool["strict"] and tool["input_schema"]["additionalProperties"] is False

    [system] = first["system"]
    assert system["cache_control"] == {"type": "ephemeral"}
    text = system["text"]
    assert "marts.fct_field_production_monthly: Net production per field and month." in text
    assert "gas_sm3 numeric: Net gas in Sm³." in system["text"]
    # Volatile facts stay out of the cached prefix
    assert "2026-08-01" not in system["text"] and "2026-11-09" not in system["text"]
    user = first["messages"][0]["content"]
    assert "2026-08-01" in user and "Top 3 gas fields in 2025" in user


def test_cached_prefix_is_identical_across_calls_and_history_is_append_only():
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS))
    ask(client, FakeDB(GAS_ROWS))

    first, second = client.calls
    assert first["system"] == second["system"] and first["tools"] == second["tools"]
    assert second["messages"][: len(first["messages"])] == first["messages"]
    # The assistant turn is passed back whole, thinking block included
    assert [b.type for b in second["messages"][1]["content"]] == ["thinking", "tool_use"]


def test_model_sees_the_rows_it_must_answer_from():
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS))
    ask(client, FakeDB(GAS_ROWS))

    result = last_tool_result(client.calls[1])
    assert result["is_error"] is False
    payload = json.loads(result["content"])
    assert payload == {
        "columns": ["field", "gas_bn_sm3"],
        "rows": [["TROLL", 41.0], ["ORMEN LANGE", 7.7], ["OSEBERG", 7.6]],
        "row_count": 3,
    }


def test_runs_the_validated_sql_not_the_model_text():
    sql = "select name from marts.dim_field -- ; drop table marts.dim_field"
    client = FakeAnthropic(
        tool_call("run_sql", {"understanding": "Field names", "sql": sql}),
        tool_call("present_answer", PRESENT_GAS),
    )
    db = FakeDB(QueryResult(["name"], [["TROLL"]], 1, False))
    run = ask(client, db)

    [ran] = db.ran
    assert "marts.dim_field" in ran and "drop" not in ran.lower() and "--" not in ran
    assert run.answer.sql == ran


def test_repairs_a_failing_query_once():
    client = FakeAnthropic(
        tool_call("run_sql", {"understanding": "Gas", "sql": "select gas from marts.dim_field"}),
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    db = FakeDB(QueryFailed('column "gas" does not exist'), GAS_ROWS)
    run = ask(client, db)

    error = last_tool_result(client.calls[1])
    assert error["is_error"] is True
    assert 'column "gas" does not exist' in error["content"]
    assert run.outcome == "answered" and len(run.attempts) == 2
    assert [a.status for a in run.attempts] == ["failed", "ok"]
    assert run.answer.steps[2].detail == "4 ms · 3 rows · fixed after one error"


def test_rejected_sql_never_reaches_the_database_and_counts_as_the_repair():
    client = FakeAnthropic(
        tool_call("run_sql", {"understanding": "x", "sql": "drop table marts.dim_field"}),
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    db = FakeDB(GAS_ROWS)
    run = ask(client, db)

    assert len(db.ran) == 1 and "drop" not in db.ran[0].lower()
    assert "Query rejected" in last_tool_result(client.calls[1])["content"]
    assert [a.status for a in run.attempts] == ["rejected", "ok"]


def test_gives_up_after_the_second_failure():
    bad = {"understanding": "Gas 2025", "sql": "select * from raw.sodir_field"}
    client = FakeAnthropic(tool_call("run_sql", bad), tool_call("run_sql", bad))
    db = FakeDB()
    run = ask(client, db)

    assert run.outcome == "failed" and not run.answer.matched
    assert len(client.calls) == 2 and db.ran == []
    assert run.answer.steps[-1].label == "Query did not work"
    assert "raw" in run.answer.steps[-1].detail
    assert len(run.answer.follow_ups) == 3


def test_timeout_is_reported_to_the_model_as_something_to_fix():
    client = FakeAnthropic(
        tool_call("run_sql", RUN_GAS),
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    db = FakeDB(QueryTimedOut("The query took longer than 3 s and was stopped."), GAS_ROWS)
    run = ask(client, db)

    error = last_tool_result(client.calls[1])
    assert error["is_error"] is True and "longer than 3 s" in error["content"]
    assert [a.status for a in run.attempts] == ["timeout", "ok"]


def test_not_in_data_runs_nothing():
    client = FakeAnthropic(
        tool_call(
            "not_in_data",
            {
                "reason": "Share prices are not in this data; it covers production and ownership.",
                "suggestions": ["How much does Aker BP produce?", "Who owns Johan Sverdrup?"],
            },
        )
    )
    db = FakeDB()
    run = ask(client, db, "What will Aker BP's share price be tomorrow?")

    assert run.outcome == "not_in_data" and db.ran == []
    answer = run.answer
    assert not answer.matched and answer.sql == "" and answer.rows == []
    assert answer.answer.startswith("Share prices are not in this data")
    assert answer.follow_ups == ["How much does Aker BP produce?", "Who owns Johan Sverdrup?"]
    assert [s.label for s in answer.steps] == ["Understood question", "No query run"]


def test_refusal_is_a_polite_no():
    run = ask(FakeAnthropic(refusal()), FakeDB())
    assert run.outcome == "declined" and not run.answer.matched


def test_nudges_once_when_no_tool_is_called():
    client = FakeAnthropic(
        text_reply("Let me think about that."),
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    run = ask(client, FakeDB(GAS_ROWS))
    assert run.outcome == "answered"
    assert "run_sql" in client.calls[1]["messages"][-1]["content"]


def test_stops_when_the_model_keeps_answering_in_text():
    run = ask(FakeAnthropic(text_reply("Hmm."), text_reply("Still thinking.")), FakeDB())
    assert run.outcome == "failed" and run.model_calls == 2


def test_present_answer_before_any_query_is_sent_back():
    client = FakeAnthropic(
        tool_call("present_answer", PRESENT_GAS),
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    run = ask(client, FakeDB(GAS_ROWS))
    assert "run_sql first" in last_tool_result(client.calls[1])["content"]
    assert run.outcome == "answered"


def test_invalid_tool_input_is_sent_back_not_run():
    client = FakeAnthropic(
        tool_call("run_sql", {"sql": GAS_SQL}),  # no understanding
        tool_call("run_sql", RUN_GAS),
        tool_call("present_answer", PRESENT_GAS),
    )
    db = FakeDB(GAS_ROWS)
    run = ask(client, db)
    assert "Invalid tool input" in last_tool_result(client.calls[1])["content"]
    assert len(db.ran) == 1 and run.outcome == "answered"


def test_model_calls_are_capped():
    client = FakeAnthropic(*[tool_call("present_answer", PRESENT_GAS) for _ in range(10)])
    run = ask(client, FakeDB())
    assert run.outcome == "failed" and len(client.calls) == 5


def test_numbers_not_in_the_result_are_flagged():
    made_up = {**PRESENT_GAS, "answer": "Troll produced 41.0 billion Sm³, 18.3% more than in 2024."}
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", made_up))
    run = ask(client, FakeDB(GAS_ROWS))
    assert "not found in the result: 18.3" in run.answer.steps[3].detail


def test_chart_with_unknown_columns_is_dropped():
    spec = {**PRESENT_GAS["chart"], "value_column": "no_such_column"}
    client = FakeAnthropic(
        tool_call("run_sql", RUN_GAS), tool_call("present_answer", {**PRESENT_GAS, "chart": spec})
    )
    answer = ask(client, FakeDB(GAS_ROWS)).answer
    assert answer.chart == [] and answer.chart_type == "none" and answer.chart_unit == ""


def test_only_the_first_rows_go_to_the_model():
    many = QueryResult(["n"], [[i] for i in range(500)], 9, truncated=True)
    client = FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS))
    answer = ask(client, FakeDB(many)).answer
    payload = json.loads(last_tool_result(client.calls[1])["content"])
    assert len(payload["rows"]) == 100 and payload["row_count"] == 500
    assert "note_cap" in payload
    assert answer.truncated and len(answer.rows) == 500
    assert "row cap reached" in answer.steps[2].detail


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Equinor owns 46.3%.", "Equinor (NCS only) owns 46.3%."),
        ("Equinor (NCS only) owns 46.3%.", "Equinor (NCS only) owns 46.3%."),
        ("Aker BP owns 31.6%.", "Aker BP owns 31.6%."),
        (
            "Equinor leads; Equinor also operates it.",
            "Equinor (NCS only) leads; Equinor also operates it.",
        ),
    ],
)
def test_equinor_is_always_labelled_ncs_only(text, expected):
    assert label_equinor(text) == expected
