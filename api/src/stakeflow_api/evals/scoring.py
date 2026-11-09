"""Scoring for the evals: result equivalence for Ask, ranges for scenario parsing. Pure functions.

Ask items are judged on what the model's SQL returned, not on the SQL text: two different
queries that give the same numbers are both right. Comparison is lenient on presentation
(column order and names, row order unless ranked, units off by a power of ten or a percent,
rounding to about half a percent, case of names) and strict on the numbers themselves.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

from stakeflow_api.ask.executor import Cell
from stakeflow_api.ask.sanity import trace_numbers
from stakeflow_api.ask.service import AskRun
from stakeflow_api.ask.sql_guard import FORBIDDEN_NODES
from stakeflow_api.scenarios.parser import ScenarioParameters

SCALES = (1, 1e3, 1e-3, 1e6, 1e-6, 1e9, 1e-9, 100, 0.01)
_NUMERIC = re.compile(r"-?\d+(?:\.\d+)?")
_WRITE_WORDS = re.compile(r"\b(drop|delete|insert|update|alter|truncate|create|grant)\b", re.I)

Rows = Sequence[Sequence[Cell]]


@dataclass
class AskScore:
    id: str
    category: str
    passed: bool
    reasons: list[str] = field(default_factory=list)
    write_attempted: bool = False
    guard_rejections: int = 0
    untraced_numbers: list[str] = field(default_factory=list)
    equinor_unlabelled: bool = False


# Cell comparison


def _norm(cell: Cell) -> float | str | None:
    if isinstance(cell, bool):
        return str(cell).lower()
    if isinstance(cell, int | float):
        return float(cell)
    if isinstance(cell, str):
        text = " ".join(cell.split()).casefold()
        return float(text) if _NUMERIC.fullmatch(text) else text
    return None


def _close(got: float, expected: float) -> bool:
    tolerance = max(0.006 * abs(expected), 0.051 if abs(expected) >= 1 else 0.0051)
    return abs(got - expected) <= tolerance


def cells_equal(expected: Cell, got: Cell) -> bool:
    e, g = _norm(expected), _norm(got)
    if e is None or g is None:
        return e is None and g is None
    if isinstance(e, float) and isinstance(g, float):
        return any(_close(g * scale, e) for scale in SCALES)
    if isinstance(e, str) and isinstance(g, str):
        return e == g
    # A year as a number against a date as text ('2025' vs '2025-01-01')
    year, text = (e, g) if isinstance(e, float) else (g, e)
    if not isinstance(year, float) or not isinstance(text, str):
        return False
    return year.is_integer() and 1900 <= year <= 2100 and text.startswith(str(int(year)))


def _row_matches(expected: Sequence[Cell], got: Sequence[Cell]) -> bool:
    """Every expected cell equals a different cell of the got row (any column order)."""
    free = list(got)
    for cell in expected:
        hit = next((i for i, g in enumerate(free) if cells_equal(cell, g)), None)
        if hit is None:
            return False
        free.pop(hit)
    return True


def _match_rows(expected: Rows, got: Rows) -> bool:
    """One-to-one: each expected row has its own matching got row."""
    free = list(got)
    for row in expected:
        hit = next((i for i, g in enumerate(free) if _row_matches(row, g)), None)
        if hit is None:
            return False
        free.pop(hit)
    return True


def _anywhere(expected: Cell, got: Rows) -> bool:
    return any(cells_equal(expected, cell) for row in got for cell in row)


def _label(row: Sequence[Cell]) -> Cell:
    return next((cell for cell in row if isinstance(cell, str)), row[0] if row else None)


def result_matches(
    match: dict[str, Any], columns: list[str], expected: Rows, got: Rows
) -> str | None:
    """None when the model's rows match the reference; otherwise the reason they do not."""
    mode = match.get("mode", "rows")
    if not expected:
        return "the reference query returned no rows"
    if not got:
        return "the model's query returned no rows"

    if mode == "rows":
        if len(got) != len(expected):
            return f"{len(got)} rows, expected {len(expected)}"
        if match.get("ordered"):
            if not all(_row_matches(e, g) for e, g in zip(expected, got, strict=True)):
                return "rows differ or are in a different order"
            return None
        return None if _match_rows(expected, got) else "rows differ"

    if mode == "contains":
        if len(got) > max(3 * len(expected), len(expected) + 20):
            return f"{len(got)} rows is far more than needed"
        return None if _match_rows(expected, got) else "some reference rows are missing"

    if mode == "value":
        if len(got) > 10:
            return f"{len(got)} rows for a single value"
        value = expected[0][0]
        return None if _anywhere(value, got) else f"value {value!r} not in the result"

    if mode == "cells":
        wanted = match.get("columns") or columns
        indexes = [columns.index(c) for c in wanted]
        if len(got) > 3 * len(expected) + 10:
            return f"{len(got)} rows is far more than needed"
        missing = [row[i] for row in expected for i in indexes if not _anywhere(row[i], got)]
        return None if not missing else f"values not in the result: {missing[:3]}"

    if mode == "top":
        label = _label(expected[0])
        if any(cells_equal(label, cell) for cell in got[0]):
            return None
        return f"first row should be {label!r}"

    if mode == "overlap":
        needed = int(match.get("min", 1))
        labels = [_label(row) for row in expected]
        found = sum(1 for label in labels if _anywhere(label, got))
        return None if found >= needed else f"{found} of {needed} expected labels found"

    raise ValueError(f"unknown match mode {mode!r}")


# Safety


def is_write(sql: str) -> bool:
    """Does this SQL try to change anything? Unparseable text counts as suspect, not as a write."""
    try:
        statements = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
    except (ParseError, TokenError):
        return bool(_WRITE_WORDS.search(sql))
    for statement in statements:
        if not isinstance(statement, exp.Select | exp.SetOperation):
            return True
        if any(isinstance(node, FORBIDDEN_NODES) for node in statement.walk()):
            return True
    return False


# Items


def score_ask(
    item: dict[str, Any], run: AskRun, reference: tuple[list[str], Rows] | None
) -> AskScore:
    score = AskScore(id=item["id"], category=item["category"], passed=False)
    answer = run.answer

    score.write_attempted = any(is_write(a.sql) for a in run.attempts)
    score.guard_rejections = sum(1 for a in run.attempts if a.status == "rejected")
    if answer.rows:
        trace = trace_numbers(answer.answer, answer.rows, item["question"])
        score.untraced_numbers = trace.untraced
    lowered = answer.answer.lower()
    score.equinor_unlabelled = "equinor" in lowered and "ncs" not in lowered
    if score.write_attempted:
        score.reasons.append("the model tried to write")

    expect = item["expect"]
    declined = run.outcome in ("not_in_data", "declined")
    must_include = [s for s in item.get("answer_must_include", []) if s.lower() not in lowered]

    if expect == "not_in_data":
        if not declined:
            score.reasons.append(f"expected not_in_data, got {run.outcome}")
    elif expect == "either":
        if not declined and (run.outcome != "answered" or must_include):
            score.reasons.append(f"answered without {must_include}")
    else:
        if run.outcome != "answered":
            score.reasons.append(f"expected an answer, got {run.outcome}")
        elif reference is None:
            score.reasons.append("no reference result")
        else:
            columns, rows = reference
            reason = result_matches(item.get("match", {}), columns, rows, answer.rows)
            if reason:
                score.reasons.append(reason)
        if run.outcome == "answered" and must_include:
            score.reasons.append(f"answer does not mention {must_include}")

    score.passed = not score.reasons
    return score


@dataclass
class ScenarioScore:
    id: str
    passed: bool
    reasons: list[str] = field(default_factory=list)


def score_scenario(
    item: dict[str, Any],
    result: ScenarioParameters | None,
    expected_ranges: dict[str, tuple[float, float]],
) -> ScenarioScore:
    """`expected_ranges` holds the item's ranges with any data-derived ones already resolved."""
    score = ScenarioScore(id=item["id"], passed=False)
    if result is None:
        if not item.get("not_understood_ok"):
            score.reasons.append("the parser gave up (422)")
        score.passed = not score.reasons
        return score

    values = result.model_dump()
    for key, (low, high) in expected_ranges.items():
        if not low - 1e-9 <= values[key] <= high + 1e-9:
            score.reasons.append(f"{key} = {values[key]}, expected {low}..{high}")
    if "company_id" in item.get("expect", {}) and result.company_id != item["expect"]["company_id"]:
        score.reasons.append(f"company_id = {result.company_id!r}")
    text = " ".join(result.assumptions).lower()
    for phrase in item.get("assumptions_mention", []):
        if phrase.lower() not in text:
            score.reasons.append(f"assumptions do not mention {phrase!r}")
    score.passed = not score.reasons
    return score
