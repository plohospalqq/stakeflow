"""Scenario arithmetic with hand-made coefficients: every expected number is checkable by hand."""

import math

import pytest
from pydantic import ValidationError

from stakeflow_api.scenario import (
    DRIVERS,
    PRESETS,
    Z80,
    ScenarioParams,
    StoredModel,
    run_scenario,
)

TERMS = ["intercept", *DRIVERS]


def model(
    estimates: dict[str, float],
    variances: dict[str, float] | None = None,
    resid_std: float = 0.0,
    t_stats: dict[str, float] | None = None,
    monthly_sd: float = 0.1,
) -> StoredModel:
    variances = variances or {}
    t_stats = t_stats or {}
    coefficients = [
        {
            "term": t,
            "estimate": estimates.get(t, 0.0),
            "std_error": math.sqrt(variances.get(t, 0.0)),
            "t_stat": t_stats.get(t, 10.0),
            "monthly_change_sd": monthly_sd,
        }
        for t in TERMS
    ]
    matrix = [[variances.get(a, 0.0) if a == b else 0.0 for b in TERMS] for a in TERMS]
    return StoredModel.from_row(coefficients, {"terms": TERMS, "matrix": matrix}, resid_std)


def test_central_change_applies_the_elasticity_to_the_log_change():
    result = run_scenario(model({"brent": 0.5}), ScenarioParams(brent_change_pct=-30))
    # 0.7 ** 0.5 - 1
    assert result.change_pct == pytest.approx(100 * (math.sqrt(0.7) - 1))
    # No uncertainty in this model: the band collapses onto the central value
    assert result.lo_change_pct == pytest.approx(result.change_pct)
    assert result.hi_change_pct == pytest.approx(result.change_pct)


def test_the_intercept_is_never_projected():
    result = run_scenario(model({"intercept": 0.05}), ScenarioParams(horizon_months=12))
    assert result.change_pct == 0


def test_residual_noise_grows_with_the_square_root_of_the_horizon():
    result = run_scenario(model({}, resid_std=0.05), ScenarioParams(horizon_months=4))
    sd = 0.05 * math.sqrt(4)
    assert result.residual_sd_log == pytest.approx(sd)
    assert result.lo_change_pct == pytest.approx(100 * (math.exp(-Z80 * sd) - 1))
    assert result.hi_change_pct == pytest.approx(100 * (math.exp(Z80 * sd) - 1))


def test_coefficient_uncertainty_scales_with_the_size_of_the_move():
    m = model({"brent": 0.5}, variances={"brent": 0.01})
    result = run_scenario(m, ScenarioParams(brent_change_pct=-30, horizon_months=1))
    assert result.coefficient_sd_log == pytest.approx(0.1 * abs(math.log(0.7)))
    assert result.residual_sd_log == 0


def test_path_ends_at_the_result_and_the_band_widens():
    m = model({"brent": 0.4}, variances={"brent": 0.004}, resid_std=0.03)
    result = run_scenario(m, ScenarioParams(brent_change_pct=20, horizon_months=6))
    widths = [p.hi_change_pct - p.lo_change_pct for p in result.path]
    assert [p.month_offset for p in result.path] == [1, 2, 3, 4, 5, 6]
    assert result.path[-1].change_pct == pytest.approx(result.change_pct)
    assert widths == sorted(widths)


def test_contributions_add_up_to_the_central_change_in_log_terms():
    m = model({"brent": 0.4, "ttf": 0.2, "production": 0.3, "eurusd": -0.5})
    params = ScenarioParams(
        brent_change_pct=-20, ttf_change_pct=40, production_change_pct=-5, eurusd_change_pct=10
    )
    result = run_scenario(m, params)
    total_log = sum(math.log1p(c.contribution_pct / 100) for c in result.contributions)
    assert total_log == pytest.approx(math.log1p(result.change_pct / 100))


def test_production_minus_100_is_floored_and_flagged():
    result = run_scenario(model({"production": 0.2}), ScenarioParams(production_change_pct=-100))
    assert result.change_pct == pytest.approx(100 * (0.01**0.2 - 1))
    assert any("computed as −99%" in c for c in result.caveats)


def test_moves_far_outside_the_fitting_window_are_called_extrapolation():
    m = model({"brent": 0.4}, monthly_sd=0.05)
    calm = run_scenario(m, ScenarioParams(brent_change_pct=-10, horizon_months=3))
    wild = run_scenario(m, ScenarioParams(brent_change_pct=-80, horizon_months=1))
    assert not any("extrapolation" in c for c in calm.caveats)
    assert any("−80% move in Brent" in c and "extrapolation" in c for c in wild.caveats)


def test_insignificant_drivers_are_flagged_only_when_used():
    m = model({"ttf": 0.1}, t_stats={"ttf": 0.8})
    assert not run_scenario(m, ScenarioParams(brent_change_pct=10)).caveats
    caveats = run_scenario(m, ScenarioParams(ttf_change_pct=10)).caveats
    assert any("TTF gas sensitivity is not statistically distinguishable" in c for c in caveats)


@pytest.mark.parametrize(
    "bad",
    [
        {"brent_change_pct": -91},
        {"ttf_change_pct": 301},
        {"production_change_pct": 101},
        {"eurusd_change_pct": -51},
        {"horizon_months": 0},
        {"horizon_months": 25},
        {"brent_change": 10},  # a typo must not silently mean "no change"
    ],
)
def test_contract_rejects_out_of_range_and_unknown_parameters(bad):
    with pytest.raises(ValidationError):
        ScenarioParams(**bad)


def test_contract_names_and_defaults_are_the_shared_ones():
    assert ScenarioParams().model_dump() == {
        "brent_change_pct": 0,
        "ttf_change_pct": 0,
        "production_change_pct": 0,
        "eurusd_change_pct": 0,
        "horizon_months": 3,
    }


def test_presets_cover_the_agreed_cases_with_valid_parameters():
    by_id = {p.id: p for p in PRESETS}
    assert len(by_id) == len(PRESETS)
    assert by_id["oil-crash"].params.brent_change_pct == -30
    assert by_id["gas-spike"].params.ttf_change_pct == 50
    assert by_id["sverdrup-outage"].params.production_change_pct == -10
    assert by_id["sverdrup-outage"].params.horizon_months == 3
    assert by_id["calm-year"].params == ScenarioParams(horizon_months=12)
    assert all(p.description for p in PRESETS)
