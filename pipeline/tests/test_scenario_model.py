"""The scenario model on synthetic data where the true sensitivities are known."""

import math
from datetime import date

import numpy as np
import pytest

from stakeflow_pipeline.ml.anomalies import add_months
from stakeflow_pipeline.ml.scenario import (
    MIN_OBS,
    TERMS,
    MonthlyInputs,
    fit_scenario_model,
    monthly_returns,
    ols,
)

TRUE = {"intercept": 0.004, "brent": 0.8, "ttf": 0.15, "production": 0.4, "eurusd": -0.6}
NOISE = 0.03


def synthetic(n_months: int, seed: int = 3, noise: float = NOISE) -> list[MonthlyInputs]:
    """Monthly levels whose log changes follow the TRUE model exactly, plus noise."""
    rng = np.random.default_rng(seed)
    level = {"share": 100.0, "brent": 80.0, "ttf": 40.0, "production": 300_000.0, "eurusd": 1.1}
    vol = {"brent": 0.08, "ttf": 0.15, "production": 0.04, "eurusd": 0.02}
    rows = [MonthlyInputs(date(2015, 1, 1), *level.values())]
    for i in range(1, n_months):
        changes = {d: float(rng.normal(0, v)) for d, v in vol.items()}
        share_change = TRUE["intercept"] + sum(TRUE[d] * changes[d] for d in vol)
        share_change += float(rng.normal(0, noise))
        level["share"] *= math.exp(share_change)
        for d in vol:
            level[d] *= math.exp(changes[d])
        rows.append(MonthlyInputs(add_months(date(2015, 1, 1), i), *level.values()))
    return rows


def test_ols_recovers_known_coefficients_within_their_standard_errors():
    model = fit_scenario_model(synthetic(240))
    assert model.status == "ok"
    fit = model.fit
    std_errors = np.sqrt(np.diag(fit.covariance))
    for term, estimate, se in zip(TERMS, fit.estimates, std_errors, strict=True):
        assert abs(estimate - TRUE[term]) < 3 * se, term
    assert fit.resid_std == pytest.approx(NOISE, rel=0.15)
    assert fit.n == 239


def test_standard_errors_match_the_textbook_formula_for_one_regressor():
    rng = np.random.default_rng(5)
    x = rng.normal(0, 1, 500)
    y = 2.0 * x + rng.normal(0, 0.5, 500)
    fit = ols(np.column_stack([np.ones(500), x]), y)
    # SE(slope) = s / sqrt(sum((x - mean)^2))
    expected_se = fit.resid_std / math.sqrt(((x - x.mean()) ** 2).sum())
    assert math.sqrt(fit.covariance[1, 1]) == pytest.approx(expected_se, rel=1e-9)
    assert fit.estimates[1] == pytest.approx(2.0, abs=0.1)


def test_backtest_explains_quarters_out_of_sample_and_the_band_is_calibrated():
    model = fit_scenario_model(synthetic(240, seed=9))
    scored = [q for q in model.backtest if q.oos is not None]

    assert len(scored) >= 70
    assert model.r2_out_of_sample_quarterly > 0.7
    assert model.r2_in_sample_quarterly >= model.r2_out_of_sample_quarterly - 0.05
    # An honest 80% band holds about 80% of the quarters
    assert 0.68 <= model.band_coverage <= 0.92


def test_pure_noise_gives_a_weak_out_of_sample_score():
    rows = synthetic(120, seed=4, noise=0.0)
    rng = np.random.default_rng(1)
    # Replace the share with a random walk unrelated to the drivers
    share = 100.0
    noisy = []
    for row in rows:
        share *= math.exp(float(rng.normal(0, 0.08)))
        noisy.append(
            MonthlyInputs(row.month, share, row.brent, row.ttf, row.production, row.eurusd)
        )
    model = fit_scenario_model(noisy)
    assert model.r2_out_of_sample_quarterly < 0.2
    assert model.fit.r2 < 0.2


def test_a_short_history_gets_no_out_of_sample_score_rather_than_a_noisy_one():
    model = fit_scenario_model(synthetic(22))  # 21 returns: only 2 scorable quarters
    assert model.status == "ok"
    assert sum(q.oos is not None for q in model.backtest) < 4
    assert model.r2_out_of_sample_quarterly is None
    assert model.band_coverage is None


def test_too_few_months_is_reported_not_fitted():
    model = fit_scenario_model(synthetic(MIN_OBS))  # MIN_OBS levels = MIN_OBS - 1 returns
    assert model.status == "insufficient_data"
    assert model.fit is None
    assert f"needs at least {MIN_OBS}" in model.status_note


def test_production_steps_from_acquisitions_are_left_out():
    rows = synthetic(40)
    jump = rows[20]
    rows[20:] = [
        MonthlyInputs(r.month, r.share, r.brent, r.ttf, r.production * 1.5, r.eurusd)
        for r in rows[20:]
    ]
    months, _, _, excluded = monthly_returns(rows)
    assert jump.month not in months
    assert excluded == {jump.month.isoformat(): "production step over 30% (portfolio change)"}


def test_missing_or_non_consecutive_months_break_the_chain():
    rows = synthetic(10)
    rows[4] = MonthlyInputs(rows[4].month, None, 1.0, 1.0, 1.0, 1.0)
    del rows[7]
    months, x, y, _ = monthly_returns(rows)
    # 9 returns; lost: into and out of the month without a share price, and into and out of
    # the deleted month (the chain does not jump the gap)
    assert len(months) == 9 - 2 - 2
    assert x.shape == (len(months), len(TERMS)) and y.shape == (len(months),)
