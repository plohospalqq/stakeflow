"""The Arps fit recovers known parameters, including the exponential limit and bad months."""

import numpy as np
import pytest

from stakeflow_pipeline.forecast import arps
from stakeflow_pipeline.forecast.arps import ArpsParams

T = np.arange(72.0)


def synthetic(params: ArpsParams, noise: float = 0.0, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return arps.rate(T, params) * np.exp(rng.normal(0, noise, T.size))


def test_noise_free_curve_is_recovered_exactly():
    truth = ArpsParams(qi=12_000.0, b=0.8, di=0.05)
    fit = arps.fit(T, synthetic(truth))
    assert fit.params.qi == pytest.approx(truth.qi, rel=1e-4)
    assert fit.params.b == pytest.approx(truth.b, abs=1e-3)
    assert fit.params.di == pytest.approx(truth.di, rel=1e-3)
    assert fit.rmse_log < 1e-6


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_hyperbolic_parameters_recovered_under_noise(seed):
    truth = ArpsParams(qi=5_000.0, b=0.9, di=0.06)
    fit = arps.fit(T, synthetic(truth, noise=0.03, seed=seed))
    assert fit.params.qi == pytest.approx(truth.qi, rel=0.05)
    assert fit.params.b == pytest.approx(truth.b, abs=0.3)
    assert fit.params.di == pytest.approx(truth.di, rel=0.25)
    # What matters for a forecast: the curve 3 years past the data
    future = np.array([T[-1] + 36])
    assert arps.rate(future, fit.params)[0] == pytest.approx(arps.rate(future, truth)[0], rel=0.1)


def test_exponential_decline_is_the_b_zero_limit():
    truth = ArpsParams(qi=800.0, b=0.0, di=0.03)
    expected = 800.0 * np.exp(-0.03 * T)
    assert arps.rate(T, truth) == pytest.approx(expected, rel=1e-12)

    fit = arps.fit(T, synthetic(truth, noise=0.02))
    assert fit.params.b < 0.2
    assert fit.params.di == pytest.approx(0.03, rel=0.15)


def test_tiny_b_matches_exponential_without_warnings():
    with np.errstate(all="raise"):
        hyperbolic = arps.rate(T, ArpsParams(qi=100.0, b=1e-14, di=0.04))
    assert hyperbolic == pytest.approx(100.0 * np.exp(-0.04 * T), rel=1e-9)


def test_a_turnaround_month_does_not_drag_the_curve_down():
    truth = ArpsParams(qi=3_000.0, b=0.5, di=0.04)
    rates = synthetic(truth, noise=0.01)
    rates[[20, 44]] *= 0.3
    fit = arps.fit(T, rates)
    assert fit.params.di == pytest.approx(truth.di, rel=0.15)
    assert fit.log_residuals[20] < -1.0


def test_parameters_stay_within_bounds_on_rising_data():
    fit = arps.fit(T, 100.0 * np.exp(0.01 * T))
    assert 0 <= fit.params.b <= arps.B_MAX
    assert fit.params.di >= 0


def test_first_year_decline_is_the_effective_rate():
    params = ArpsParams(qi=1.0, b=0.5, di=0.05)
    expected = 1 - (1 + 0.5 * 0.05 * 12) ** (-1 / 0.5)
    assert params.first_year_decline() == pytest.approx(expected)
    assert ArpsParams(qi=1.0, b=0.0, di=0.05).first_year_decline() == pytest.approx(
        1 - np.exp(-0.6)
    )


def test_rejects_shut_in_months():
    with pytest.raises(ValueError, match="positive"):
        arps.fit(T, np.r_[np.ones(71), 0.0])
