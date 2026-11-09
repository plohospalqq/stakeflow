"""Quarter aggregation: day-weighted shares as known at the freeze date, observed + forecast."""

from datetime import date

import numpy as np
import pytest

from stakeflow_pipeline.forecast import nowcast
from stakeflow_pipeline.forecast.field_model import FieldForecast, Status
from stakeflow_pipeline.forecast.nowcast import OPEN_END, OwnershipPeriod
from stakeflow_pipeline.forecast.periods import Quarter

Q4 = Quarter.parse("2026Q4")


def test_mid_month_deal_is_day_weighted():
    rows = [
        OwnershipPeriod(1, "aker-bp", date(2020, 1, 1), date(2026, 11, 16), 20.0),
        OwnershipPeriod(1, "aker-bp", date(2026, 11, 16), OPEN_END, 30.0),
    ]
    shares = nowcast.group_shares(rows, "aker-bp", Q4.months, known_at=date(2026, 12, 31))
    assert shares[(1, date(2026, 10, 1))] == pytest.approx(0.20)
    assert shares[(1, date(2026, 11, 1))] == pytest.approx(0.20 * 15 / 30 + 0.30 * 15 / 30)
    assert shares[(1, date(2026, 12, 1))] == pytest.approx(0.30)


def test_shares_only_use_what_was_known_at_the_freeze_date():
    rows = [
        # Ended after the freeze date: at the time it looked open-ended
        OwnershipPeriod(1, "var-energi", date(2020, 1, 1), date(2026, 11, 1), 50.0),
        # Started after the freeze date: unknown at the time
        OwnershipPeriod(2, "var-energi", date(2026, 11, 1), OPEN_END, 10.0),
        # Another company's row
        OwnershipPeriod(1, "equinor", date(2020, 1, 1), OPEN_END, 50.0),
    ]
    shares = nowcast.group_shares(rows, "var-energi", Q4.months, known_at=date(2026, 10, 15))
    assert shares == {(1, m): pytest.approx(0.5) for m in Q4.months}


def fake_forecast(field_id: int, months: list[date], volume: float, spread: float) -> FieldForecast:
    draws = np.linspace(volume - spread, volume + spread, 101)[:, None] * np.ones(len(months))
    return FieldForecast(field_id, Status.ARPS, months, draws)


def test_observed_months_plus_forecast_months():
    data_through = date(2026, 10, 1)
    forecast_months = [date(2026, 11, 1), date(2026, 12, 1)]
    forecasts = {7: fake_forecast(7, forecast_months, volume=100_000.0, spread=10_000.0)}
    shares = {(7, m): 0.5 for m in Q4.months}
    result = nowcast.nowcast_quarter(
        "aker-bp", Q4, data_through, {date(2026, 10, 1): 80_000.0}, forecasts, shares, draws=101
    )
    total = 80_000.0 + 2 * 0.5 * 100_000.0
    assert result.months_in_data == 1
    assert result.value_kboe_d == pytest.approx(round(total * 6.2898 / 92 / 1000, 1))
    assert result.lo < result.value_kboe_d < result.hi


def test_fields_without_a_forecast_contribute_nothing():
    result = nowcast.nowcast_quarter(
        "aker-bp", Q4, date(2026, 9, 1), {}, {}, {(9, date(2026, 10, 1)): 1.0}, draws=10
    )
    assert (result.value_kboe_d, result.lo, result.hi, result.months_in_data) == (0, 0, 0, 0)


def test_months_needed_counts_from_the_month_after_the_data():
    assert nowcast.months_needed(Q4, date(2026, 8, 1)) == 4
    assert nowcast.months_needed(Q4, date(2026, 12, 1)) == 0
