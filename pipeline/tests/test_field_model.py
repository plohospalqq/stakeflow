"""Decline detection, forecast ranges and backtests on synthetic fields with known truth."""

from datetime import date

import numpy as np
import pytest

from stakeflow_pipeline.forecast import arps, field_model
from stakeflow_pipeline.forecast.arps import ArpsParams
from stakeflow_pipeline.forecast.field_model import FieldSeries, Status
from stakeflow_pipeline.forecast.periods import add_months, days_in_month

START = date(2015, 1, 1)


def series_from_rates(rates: np.ndarray, field_id: int = 1) -> FieldSeries:
    months = [add_months(START, i) for i in range(rates.size)]
    days = np.array([days_in_month(m) for m in months], dtype=float)
    return FieldSeries(field_id, months, rates * days)


def plateau_then_decline(
    params: ArpsParams, plateau: int = 12, decline: int = 84, noise: float = 0.05, seed: int = 0
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    curve = np.r_[np.full(plateau, params.qi), arps.rate(np.arange(decline, dtype=float), params)]
    return curve * np.exp(rng.normal(0, noise, curve.size))


def test_decline_starts_where_the_plateau_ends():
    rates = plateau_then_decline(ArpsParams(qi=10_000, b=0.5, di=0.05), noise=0.0)
    status, start = field_model.classify(rates)
    assert status is Status.ARPS
    # Within 10% of the peak for about two months into the decline (0.9 = e^-0.105)
    assert start is not None and 12 <= start <= 15


@pytest.mark.parametrize(
    ("rates", "expected"),
    [
        (np.r_[np.full(40, 500.0), np.zeros(3)], Status.SHUT_DOWN),
        (np.full(8, 500.0), Status.TOO_SHORT),
        (np.full(60, 500.0), Status.PLATEAU),
        (np.r_[np.full(30, 100.0), np.linspace(100, 400, 14)], Status.RAMP_UP),
    ],
)
def test_fields_that_are_not_declining_are_flagged(rates, expected):
    assert field_model.classify(rates)[0] is expected


def test_flat_fields_are_held_at_their_recent_level():
    forecast = field_model.forecast(series_from_rates(np.full(60, 500.0)), horizon=12)
    assert forecast.status is Status.PLATEAU
    assert forecast.params is None
    _, p50, _ = forecast.quantiles()
    days = np.array([days_in_month(m) for m in forecast.months])
    assert p50 / days == pytest.approx(500.0, rel=0.01)


def test_shut_down_fields_forecast_zero():
    forecast = field_model.forecast(series_from_rates(np.r_[np.full(40, 500.0), np.zeros(3)]))
    assert forecast.status is Status.SHUT_DOWN
    assert not forecast.draws.any()


def test_forecast_shape_order_and_determinism():
    s = series_from_rates(plateau_then_decline(ArpsParams(qi=8_000, b=0.7, di=0.04)))
    first = field_model.forecast(s)
    again = field_model.forecast(s)
    assert first.draws.shape == (field_model.DRAWS, field_model.HORIZON_MONTHS)
    assert first.months[0] == add_months(s.months[-1], 1)
    p10, p50, p90 = first.quantiles()
    assert np.all(p10 <= p50) and np.all(p50 <= p90)
    # Same inputs, same seed, same numbers: predictions are reproducible
    assert np.array_equal(first.draws, again.draws)
    # The range widens with the horizon
    assert p90[-1] / p10[-1] > p90[0] / p10[0]


def test_interval_covers_about_80_percent_on_synthetic_fields():
    """Fields that follow the model's own assumptions: Arps decline plus log-normal noise."""
    rng = np.random.default_rng(42)
    inside = total = 0
    for k in range(40):
        params = ArpsParams(
            qi=rng.uniform(1e3, 3e4), b=rng.uniform(0, 1.2), di=rng.uniform(0.02, 0.08)
        )
        s = series_from_rates(plateau_then_decline(params, seed=k), field_id=k)
        bt = field_model.backtest(s)
        assert bt is not None and bt.status is Status.ARPS
        inside += int(((bt.actual >= bt.p10) & (bt.actual <= bt.p90)).sum())
        total += bt.actual.size
    assert 0.7 <= inside / total <= 0.9


def test_backtest_beats_naive_on_a_steady_decline():
    s = series_from_rates(plateau_then_decline(ArpsParams(qi=20_000, b=0.3, di=0.04), noise=0.02))
    bt = field_model.backtest(s)
    assert bt is not None
    assert bt.scored_months == 12
    assert bt.mape_pct() < bt.naive_mape_pct()
    assert bt.naive_bias_pct() > 5  # flat overshoots a declining field


def test_backtest_needs_enough_history():
    assert field_model.backtest(series_from_rates(np.full(20, 100.0))) is None


def test_seasonal_profile_recovers_a_summer_dip():
    months = [add_months(START, i) for i in range(72)]
    dip = np.array([-0.2 if m.month in (6, 7, 8) else 0.0 for m in months])
    rates = 1000.0 * np.exp(dip)
    profile = field_model.seasonal_profile(months, rates)
    assert profile.mean() == pytest.approx(0, abs=1e-12)
    assert profile[6] < -0.1 < 0 < profile[0]


def test_negative_net_volumes_count_as_zero():
    s = series_from_rates(np.array([100.0, -5.0, 100.0]))
    assert s.rates[1] == 0
