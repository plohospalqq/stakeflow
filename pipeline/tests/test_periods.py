from datetime import date

import pytest

from stakeflow_pipeline.forecast.periods import (
    Quarter,
    add_months,
    latest_month_available,
    months_between,
)


def test_quarter_parse_label_and_bounds():
    q = Quarter.parse("2026Q4")
    assert q.start == date(2026, 10, 1)
    assert q.end == date(2026, 12, 31)
    assert q.days == 92
    assert q.label == "2026Q4"
    assert q.months == [date(2026, 10, 1), date(2026, 11, 1), date(2026, 12, 1)]
    assert q.next() == Quarter.parse("2027Q1")
    assert q.previous() == Quarter.containing(date(2026, 8, 15))


@pytest.mark.parametrize("bad", ["2026Q5", "2026-Q4", "26Q1", ""])
def test_quarter_parse_rejects_bad_labels(bad):
    with pytest.raises(ValueError):
        Quarter.parse(bad)


def test_month_helpers():
    assert add_months(date(2026, 11, 1), 3) == date(2027, 2, 1)
    assert add_months(date(2026, 1, 1), -1) == date(2025, 12, 1)
    assert months_between(date(2026, 11, 1), date(2027, 1, 1)) == [
        date(2026, 11, 1),
        date(2026, 12, 1),
        date(2027, 1, 1),
    ]


def test_publication_lag_decides_which_months_were_out():
    # 69 days after 30 Sep is 8 Dec: on 31 Dec September was out, October was not
    assert latest_month_available(date(2026, 12, 31), 69) == date(2026, 9, 1)
    # On 30 Sep 2026 July (ended 31 Jul + 69 = 8 Oct) was not out yet
    assert latest_month_available(date(2026, 9, 30), 69) == date(2026, 6, 1)
