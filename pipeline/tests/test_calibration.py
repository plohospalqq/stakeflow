"""Range calibration: scores in half-widths, the widening factor and what it does to a range."""

import pytest

from stakeflow_pipeline.forecast import calibration


def test_score_is_one_on_the_bound_and_counts_half_widths():
    assert calibration.score(110.0, 90.0, 100.0, 110.0) == pytest.approx(1.0)
    assert calibration.score(90.0, 90.0, 100.0, 110.0) == pytest.approx(1.0)
    assert calibration.score(100.0, 90.0, 100.0, 110.0) == pytest.approx(0.0)
    # Twice as far as the upper bound, on the log scale
    assert calibration.score(121.0, 90.0, 100.0, 110.0) == pytest.approx(2.0)


def test_score_uses_the_side_the_actual_fell_on():
    # A range that is wider below than above: the same miss is a smaller surprise below
    below = calibration.score(80.0, 80.0, 100.0, 105.0)
    above = calibration.score(125.0, 80.0, 100.0, 105.0)
    assert below == pytest.approx(1.0) and above > 4


def test_no_score_without_an_actual_or_a_width():
    assert calibration.score(0.0, 90.0, 100.0, 110.0) is None
    # All three months observed: the range has collapsed to the value
    assert calibration.score(101.0, 100.0, 100.0, 100.0) is None


def test_factor_puts_80_percent_of_past_quarters_inside():
    scores = [0.1 * k for k in range(1, 21)]  # 0.1 .. 2.0
    by = calibration.factor(scores)
    assert sum(s <= by for s in scores) / len(scores) == pytest.approx(0.8)


def test_factor_never_narrows_and_waits_for_enough_history():
    assert calibration.factor([0.2] * 40) == 1.0
    assert calibration.factor([3.0] * (calibration.MIN_SCORES - 1)) == 1.0
    assert calibration.factor([3.0] * calibration.MIN_SCORES) == pytest.approx(3.0)


def test_widen_scales_both_sides_and_keeps_the_centre():
    lo, hi = calibration.widen(90.0, 100.0, 110.0, 2.0)
    assert lo == pytest.approx(81.0) and hi == pytest.approx(121.0)
    assert calibration.widen(90.0, 100.0, 110.0, 1.0) == pytest.approx((90.0, 110.0))
    # The widened range holds exactly the actuals that score within the factor
    assert calibration.score(hi, 90.0, 100.0, 110.0) == pytest.approx(2.0)
