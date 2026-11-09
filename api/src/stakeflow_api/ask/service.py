"""The Ask workflow: question → one validated read-only query → plain-language answer.

A fixed workflow, not an open-ended agent, so the loop is ours rather than the SDK tool runner:
the model gets three tools (run_sql, not_in_data, present_answer) and the conversation is
question → run_sql → rows → present_answer, with exactly one repair round if the SQL is rejected
or fails, and a hard cap on model calls. The answer step stops on the present_answer call itself,
without a further round trip.

The model never sees the database directly: SQL goes through the guard (sql_guard.py) and runs
as the read-only role (executor.py); the model sees the rows that came back and nothing else.
"""

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from stakeflow_api.ask import prompts
from stakeflow_api.ask.catalog import Catalog
from stakeflow_api.ask.executor import Cell, QueryFailed, QueryResult, QueryTimedOut
from stakeflow_api.ask.sanity import trace_numbers
from stakeflow_api.ask.sql_guard import UnsafeSQL, validate_sql
from stakeflow_api.llm import MessagesClient, create_message, first_tool_use, tool_result
from stakeflow_api.schemas import AskAnswer, AskChartLegend, AskChartPoint, AskStep

MAX_MODEL_CALLS = 5
MAX_REPAIRS = 1
ROWS_SHOWN_TO_MODEL = 100
MAX_CHART_POINTS = 100

# Same questions the Ask page offers first: all answerable, so a dead end always has a way out
GOOD_QUESTIONS = (
    "Which Aker BP fields changed the most compared with a year ago?",
    "Who owns the most of Johan Castberg?",
    "Top 10 gas fields in 2025",
)

RunQuery = Callable[[str], QueryResult]
Outcome = Literal["answered", "not_in_data", "failed", "declined"]


@dataclass(frozen=True)
class AskContext:
    catalog: Catalog
    latest_month: date | None

    @property
    def system(self) -> str:
        return prompts.system_prompt(self.catalog.describe())


@dataclass
class SqlAttempt:
    sql: str  # as the model wrote it
    status: Literal["ok", "rejected", "failed", "timeout"]
    executed_sql: str | None = None
    error: str | None = None
    tables: list[str] = field(default_factory=list)


@dataclass
class AskRun:
    """The answer plus what happened on the way, for evals and tests."""

    answer: AskAnswer
    outcome: Outcome
    attempts: list[SqlAttempt]
    model_calls: int


class _RunSql(BaseModel):
    understanding: str
    sql: str


class _NotInData(BaseModel):
    reason: str
    suggestions: list[str]


class _Chart(BaseModel):
    type: Literal["bar", "line", "none"]
    label_column: str | None
    value_column: str | None
    previous_column: str | None
    unit: str
    value_legend: str
    previous_legend: str | None


class _PresentAnswer(BaseModel):
    answer: str
    sanity_check: str
    chart: _Chart
    follow_ups: list[str]


def answer_question(
    question: str,
    *,
    client: MessagesClient,
    context: AskContext,
    run_query: RunQuery,
    today: date,
) -> AskRun:
    system = context.system
    latest = context.latest_month.isoformat() if context.latest_month else "unknown"
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": prompts.user_message(question, latest, today.isoformat())}
    ]
    attempts: list[SqlAttempt] = []
    understanding = ""
    result: QueryResult | None = None
    executed: SqlAttempt | None = None
    nudged = False

    for call in range(1, MAX_MODEL_CALLS + 1):
        response = create_message(
            client, system=system, tools=prompts.TOOLS, messages=messages, purpose="ask"
        )
        if response.stop_reason == "refusal":
            return AskRun(_declined(question), "declined", attempts, call)
        if response.stop_reason == "max_tokens":
            break  # a tool call cut off mid-input must not run
        messages.append({"role": "assistant", "content": response.content})

        tool_use = first_tool_use(response)
        if tool_use is None:
            if nudged:
                break
            nudged = True
            messages.append({"role": "user", "content": prompts.NUDGE})
            continue

        reply: dict[str, Any]
        if tool_use.name == "not_in_data":
            parsed = _parse(_NotInData, tool_use.input)
            if isinstance(parsed, _NotInData):
                return AskRun(_not_in_data(question, parsed), "not_in_data", attempts, call)
            reply = tool_result(tool_use.id, parsed, is_error=True)

        elif tool_use.name == "run_sql":
            parsed = _parse(_RunSql, tool_use.input)
            if not isinstance(parsed, _RunSql):
                reply = tool_result(tool_use.id, parsed, is_error=True)
            elif result is not None:
                reply = tool_result(
                    tool_use.id,
                    "You already have the rows; one query per question. Call present_answer.",
                    is_error=True,
                )
            else:
                understanding = parsed.understanding.strip()
                attempt, attempt_result = _run(parsed.sql, context.catalog, run_query)
                attempts.append(attempt)
                if attempt_result is not None:
                    executed, result = attempt, attempt_result
                    reply = tool_result(tool_use.id, _rows_for_model(attempt_result))
                elif _failures(attempts) > MAX_REPAIRS:
                    break
                else:
                    reply = tool_result(
                        tool_use.id,
                        f"{attempt.error}\nFix the query and call run_sql again, or call "
                        "not_in_data if the tables cannot answer the question.",
                        is_error=True,
                    )

        elif tool_use.name == "present_answer":
            parsed = _parse(_PresentAnswer, tool_use.input)
            if not isinstance(parsed, _PresentAnswer):
                reply = tool_result(tool_use.id, parsed, is_error=True)
            elif result is None or executed is None:
                reply = tool_result(tool_use.id, "Run a query with run_sql first.", is_error=True)
            else:
                answer = _answered(
                    question, understanding, executed, result, parsed, repaired=len(attempts) > 1
                )
                return AskRun(answer, "answered", attempts, call)

        else:
            reply = tool_result(tool_use.id, f"Unknown tool {tool_use.name!r}.", is_error=True)

        messages.append({"role": "user", "content": [reply]})

    return AskRun(_failed(question, understanding, attempts), "failed", attempts, call)


def _run(sql: str, catalog: Catalog, run_query: RunQuery) -> tuple[SqlAttempt, QueryResult | None]:
    try:
        guarded = validate_sql(sql, catalog.allowed_tables)
    except UnsafeSQL as exc:
        return SqlAttempt(sql=sql, status="rejected", error=f"Query rejected: {exc}"), None
    try:
        result = run_query(guarded.sql)
    except QueryTimedOut as exc:
        return SqlAttempt(
            sql, "timeout", guarded.sql, f"Query stopped: {exc}", guarded.tables
        ), None
    except QueryFailed as exc:
        return SqlAttempt(sql, "failed", guarded.sql, f"Query failed: {exc}", guarded.tables), None
    return SqlAttempt(sql, "ok", guarded.sql, None, guarded.tables), result


def _failures(attempts: list[SqlAttempt]) -> int:
    return sum(1 for a in attempts if a.status != "ok")


def _parse(model: type[BaseModel], data: Any) -> BaseModel | str:
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        return f"Invalid tool input: {exc.errors()[0]['msg']} at {exc.errors()[0]['loc']}."


def _rows_for_model(result: QueryResult) -> str:
    shown = result.rows[:ROWS_SHOWN_TO_MODEL]
    payload: dict[str, Any] = {
        "columns": result.columns,
        "rows": shown,
        "row_count": len(result.rows),
    }
    if len(shown) < len(result.rows):
        payload["note"] = f"Only the first {len(shown)} rows are shown here."
    if result.truncated:
        payload["note_cap"] = "The 500-row cap was reached; there may be more rows."
    return json.dumps(payload, ensure_ascii=False, default=str)


def _answered(
    question: str,
    understanding: str,
    attempt: SqlAttempt,
    result: QueryResult,
    model: _PresentAnswer,
    *,
    repaired: bool,
) -> AskAnswer:
    answer = label_equinor(model.answer.strip())
    tables = attempt.tables
    plural = "s" if len(tables) != 1 else ""
    ran = f"{result.duration_ms} ms · {len(result.rows)} row{'s' if len(result.rows) != 1 else ''}"
    if result.truncated:
        ran += " (row cap reached)"
    if repaired:
        ran += " · fixed after one error"
    points, chart_type = _chart(model.chart, result)

    return AskAnswer(
        question=question,
        steps=[
            AskStep(label="Understood question", detail=understanding or question),
            AskStep(
                label=f"Found {len(tables)} table{plural}",
                detail=", ".join(t.split(".", 1)[1] for t in tables) or "No tables",
            ),
            AskStep(label="Ran query", detail=ran),
            AskStep(
                label="Sanity check", detail=_sanity(answer, model.sanity_check, result, question)
            ),
        ],
        answer=answer,
        sql=attempt.executed_sql or "",
        duration_ms=result.duration_ms,
        columns=result.columns,
        rows=result.rows,
        chart=points,
        chart_unit=model.chart.unit if points else "",
        chart_legend=AskChartLegend(
            current=model.chart.value_legend if points else "",
            previous=model.chart.previous_legend if points else None,
        ),
        chart_type=chart_type,
        follow_ups=_follow_ups(model.follow_ups),
        matched=True,
        truncated=result.truncated,
    )


def _sanity(answer: str, model_note: str, result: QueryResult, question: str) -> str:
    if not result.rows:
        return "The query returned no rows"
    trace = trace_numbers(answer, result.rows, question)
    parts = [model_note.strip().rstrip(".")] if model_note.strip() else []
    if trace.checked and trace.ok:
        parts.append(f"all {trace.checked} numbers in the answer are in the result")
    elif trace.untraced:
        shown = ", ".join(trace.untraced[:3])
        parts.append(f"not found in the result: {shown} (check before relying on it)")
    text = "; ".join(parts) or "Answer checked against the result"
    return text[0].upper() + text[1:]


_EQUINOR_UNLABELLED = re.compile(r"\bEquinor\b(?!\s*\(NCS)")


def label_equinor(text: str) -> str:
    """Every Equinor number here is Norwegian-shelf only; make sure the answer says so."""
    if "ncs only" in text.lower() or not _EQUINOR_UNLABELLED.search(text):
        return text
    return _EQUINOR_UNLABELLED.sub("Equinor (NCS only)", text, count=1)


def _chart(spec: _Chart, result: QueryResult) -> tuple[list[AskChartPoint], Any]:
    columns = result.columns
    if spec.type == "none" or spec.label_column not in columns or spec.value_column not in columns:
        return [], "none"
    label_at = columns.index(spec.label_column)
    value_at = columns.index(spec.value_column)
    previous_at = columns.index(spec.previous_column) if spec.previous_column in columns else None

    points = []
    for row in result.rows[:MAX_CHART_POINTS]:
        value = row[value_at]
        if not _is_number(value):
            continue
        previous = row[previous_at] if previous_at is not None else None
        points.append(
            AskChartPoint(
                label=str(row[label_at]),
                value=float(value),  # type: ignore[arg-type]
                previous=float(previous) if _is_number(previous) else None,  # type: ignore[arg-type]
            )
        )
    return points, (spec.type if points else "none")


def _is_number(value: Cell) -> bool:
    return isinstance(value, int | float)


def _follow_ups(suggestions: list[str]) -> list[str]:
    cleaned = [s.strip() for s in suggestions if s.strip()]
    return cleaned[:3] or list(GOOD_QUESTIONS)


def _not_in_data(question: str, model: _NotInData) -> AskAnswer:
    return _no_answer(
        question,
        steps=[
            AskStep(label="Understood question", detail="Not something these tables cover"),
            AskStep(label="No query run", detail="Nothing was looked up"),
        ],
        answer=label_equinor(model.reason.strip()),
        follow_ups=_follow_ups(model.suggestions),
    )


def _failed(question: str, understanding: str, attempts: list[SqlAttempt]) -> AskAnswer:
    steps = [AskStep(label="Understood question", detail=understanding or question)]
    if attempts:
        last = attempts[-1]
        steps.append(AskStep(label="Query did not work", detail=last.error or "Unknown error"))
    return _no_answer(
        question,
        steps=steps,
        answer=(
            "I could not build a query that answers this. Try rephrasing the question, or start "
            "from one of the suggestions."
        ),
        follow_ups=list(GOOD_QUESTIONS),
        sql=attempts[-1].executed_sql or attempts[-1].sql if attempts else "",
    )


def _declined(question: str) -> AskAnswer:
    return _no_answer(
        question,
        steps=[AskStep(label="Understood question", detail="The model declined this question")],
        answer="This question cannot be answered here. Try one of the suggestions.",
        follow_ups=list(GOOD_QUESTIONS),
    )


def _no_answer(
    question: str, *, steps: list[AskStep], answer: str, follow_ups: list[str], sql: str = ""
) -> AskAnswer:
    return AskAnswer(
        question=question,
        steps=steps,
        answer=answer,
        sql=sql,
        duration_ms=0,
        columns=[],
        rows=[],
        chart=[],
        chart_unit="",
        chart_legend=AskChartLegend(current="", previous=None),
        follow_ups=follow_ups,
        matched=False,
    )
