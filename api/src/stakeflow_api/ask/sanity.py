"""Check that the numbers in a model-written answer come from the query result.

The model is told to state only numbers that appear in the rows; this verifies it. A number
counts as traced when some cell matches it after rounding to the precision the answer shows,
allowing for unit scaling (373.9 kboe/d from 373 900 boe/d, 46% from 0.46) and for the sign
being carried by words ("down 12%" for -12). Small whole numbers (counts like "5 fields") and
numbers the question itself contains are not checked.
"""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from stakeflow_api.ask.executor import Cell

SCALES = (1, 1e3, 1e-3, 1e6, 1e-6, 1e9, 1e-9, 100, 0.01)

# Signs: plus, hyphen-minus, minus sign, en dash. Thousands separators: comma, no-break space,
# narrow no-break space, space. Matches 1 234 567.8 / 1,234,567.8 / 1234.5 / -36.7 / 12%.
SIGNS = "+-\u2212\u2013"
SEPARATORS = ",\u00a0\u202f "
NUMBER = re.compile(
    rf"(?<![\w.])[{re.escape(SIGNS)}]?(?:\d{{1,3}}(?:[{SEPARATORS}]\d{{3}})+|\d+)(?:\.\d+)?(?![\w])"
)
YEAR = re.compile(r"\d{4}")


@dataclass(frozen=True)
class NumberTrace:
    checked: int
    untraced: list[str]

    @property
    def ok(self) -> bool:
        return not self.untraced


def trace_numbers(answer: str, rows: Sequence[Sequence[Cell]], question: str) -> NumberTrace:
    numbers = [abs(cell) for row in rows for cell in row if isinstance(cell, int | float)]
    texts = [cell for row in rows for cell in row if isinstance(cell, str)]
    question_numbers = {_value(token) for token in NUMBER.findall(question)}

    checked, untraced = 0, []
    for token in NUMBER.findall(answer):
        value = _value(token)
        if value in question_numbers or _is_small_count(token, value):
            continue
        checked += 1
        if not (_in_cells(value, _decimals(token), numbers) or _in_texts(token, value, texts)):
            untraced.append(token.lstrip(SIGNS))
    return NumberTrace(checked=checked, untraced=untraced)


def _value(token: str) -> float:
    digits = re.sub(f"[{SEPARATORS}]", "", token).lstrip(SIGNS)
    return float(digits)


def _decimals(token: str) -> int:
    return len(token.split(".")[1]) if "." in token else 0


def _is_small_count(token: str, value: float) -> bool:
    return "." not in token and value <= 12


def _in_cells(value: float, decimals: int, numbers: Iterable[float]) -> bool:
    # Half a unit in the last shown digit, plus a hair for float noise
    tolerance = 0.5 * 10**-decimals + 1e-9
    return any(abs(number * scale - value) <= tolerance for number in numbers for scale in SCALES)


def _in_texts(token: str, value: float, texts: Iterable[str]) -> bool:
    """Years and other numbers that arrive as text: dates ('2025-07-01') or labels ('2025')."""
    plain = token.lstrip(SIGNS)
    if YEAR.fullmatch(plain) and 1900 <= value <= 2100:
        return any(plain in text for text in texts)
    return any(text.strip() == plain for text in texts)
