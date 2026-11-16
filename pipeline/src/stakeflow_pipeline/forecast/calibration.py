"""Range calibration for the quarterly nowcast: widen the range until it is honest.

The nowcast sums simulated field paths draw by draw, as if field errors were independent. They
are not (a gas plant outage, a start-up the decline model cannot see), so the raw 80% range is
too narrow: it held the Sodir-attributed actual in 67% of 42 backtest quarters.

Instead of guessing a correlation, the range is scaled by what past quarters showed:

    score  = how many of its own half-widths the actual landed from the centre (log scale)
    factor = the 80th percentile of the scores of every earlier quarter (never below 1)
    range  = centre x (raw bound / centre) ^ factor

So a quarter with two months already observed stays narrow and one that is all forecast gets
wide, both by the same factor. Only quarters whose actuals were known at the freeze date are
used, so a backtest never sees its own future. Replayed 2023Q1-2026Q2 with the factor learned
from 2020Q1 on, the calibrated range held 37 of 42 actuals (88%) at 19% width, against 28 of 42
(67%) at 13% for the raw one. The centre is not moved: shifting it by the past median error was
tried and left the error unchanged (4.6% against 4.7%).
"""

import math
from collections.abc import Sequence

import numpy as np

LEVEL = 80.0
# Four quarters of three companies: fewer scores than this and the range stays as simulated
MIN_SCORES = 12


def score(actual: float, lo: float, mid: float, hi: float) -> float | None:
    """Distance of `actual` from `mid`, in half-widths of the range on that side (log scale).

    1.0 is exactly on the bound, below 1 inside the range. None when there is nothing to
    measure against: no actual yet, or a range of zero width on that side.
    """
    if actual <= 0 or mid <= 0:
        return None
    bound = hi if actual >= mid else lo
    if bound <= 0 or bound == mid:
        return None
    return math.log(actual / mid) / math.log(bound / mid)


def factor(scores: Sequence[float]) -> float:
    """The widening that would have put 80% of the scored quarters inside their range."""
    if len(scores) < MIN_SCORES:
        return 1.0
    return max(1.0, float(np.percentile(scores, LEVEL)))


def widen(lo: float, mid: float, hi: float, by: float) -> tuple[float, float]:
    """The range with both sides scaled by `by` on the log scale, around an unchanged centre."""
    if mid <= 0 or lo <= 0:
        return lo, hi
    return mid * (lo / mid) ** by, mid * (hi / mid) ** by
