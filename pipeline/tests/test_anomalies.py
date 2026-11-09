"""The anomaly rule on synthetic production series with known answers."""

import math
from datetime import date

import numpy as np
import pytest

from stakeflow_pipeline.ml.anomalies import (
    AnomalyParams,
    FieldHistory,
    add_months,
    describe,
    evaluate_field,
    severity,
)

PARAMS = AnomalyParams()
START = date(2020, 1, 1)


def field(
    rates: list[float],
    status: str = "Producing",
    first: date | None = START,
    last: date | None = None,
) -> FieldHistory:
    months = [add_months(START, i) for i in range(len(rates))]
    return FieldHistory(
        field_id=1,
        months=months,
        boe_per_day=rates,
        status=status,
        first_production_month=first,
        last_production_month=last or months[-1],
    )


def declining(n: int, start: float = 50_000, decline: float = 0.01, noise: float = 0.01) -> list:
    rng = np.random.default_rng(7)
    return [start * (1 - decline) ** i * (1 + rng.normal(0, noise)) for i in range(n)]


def judge(history: FieldHistory, month_offset: int):
    month = add_months(START, month_offset)
    (evaluation,) = evaluate_field(history, [month], PARAMS)
    return evaluation


def test_steady_decline_is_expected_not_flagged():
    rates = declining(48)
    history = field(rates)
    evaluations = evaluate_field(history, history.months[24:], PARAMS)

    assert not any(e.is_anomaly for e in evaluations)
    # The trend extends the decline: expected within 3% of the noise-free truth
    for e in evaluations:
        truth = 50_000 * 0.99 ** history.months.index(e.month)
        assert e.expected_boe_d == pytest.approx(truth, rel=0.03)


def test_outage_of_40_percent_is_flagged_high():
    rates = declining(48)
    rates[40] *= 0.60
    e = judge(field(rates), 40)

    assert e.is_anomaly
    assert e.severity == "high"
    assert e.pct_vs_expected == pytest.approx(-0.40, abs=0.03)
    assert e.actual_boe_d < e.lo_boe_d


def test_small_dip_under_ten_percent_is_not_flagged_even_on_a_smooth_field():
    rates = declining(48, noise=0.002)
    rates[40] *= 0.93
    e = judge(field(rates), 40)

    # More than 3 sigmas off on such a smooth field, but under 10%: not an anomaly
    assert abs(math.log(1 + e.pct_vs_expected)) > 3 * e.sigma_log
    assert not e.is_anomaly


def test_noisy_field_needs_more_than_ten_percent():
    rates = declining(48, noise=0.08)
    rates[40] = rates[40] * 0.85 / (rates[40] / (50_000 * 0.99**40))  # exactly 15% below trend
    e = judge(field(rates), 40)

    assert e.pct_vs_expected == pytest.approx(-0.15, abs=0.06)
    assert not e.is_anomaly  # within 3 robust sigmas of a noisy field


def test_seasonal_gas_field_winter_swing_is_normal_but_a_drop_is_not():
    n = 60
    swing = [1 + 0.25 * math.cos(2 * math.pi * i / 12) for i in range(n)]  # peak in January
    rates = [r * s for r, s in zip(declining(n, decline=0.005), swing, strict=True)]
    rates[55] *= 0.65
    history = field(rates)
    evaluations = {e.month: e for e in evaluate_field(history, history.months[40:], PARAMS)}

    flagged = [m for m, e in evaluations.items() if e.is_anomaly]
    assert flagged == [history.months[55]]
    assert evaluations[history.months[55]].seasonal


def test_seasonality_is_only_used_where_it_would_have_forecast_better():
    e = judge(field(declining(60, noise=0.05)), 55)
    assert not e.seasonal


def test_an_earlier_outage_does_not_drag_the_baseline_down():
    rates = declining(48)
    rates[36] *= 0.4  # inside the 12-month window used for month 40
    e = judge(field(rates), 40)

    assert e.expected_boe_d == pytest.approx(50_000 * 0.99**40, rel=0.03)
    assert not e.is_anomaly


def test_zero_production_is_a_full_outage():
    rates = declining(48)
    rates[40] = 0.0
    e = judge(field(rates), 40)

    assert e.is_anomaly
    assert e.pct_vs_expected == -1.0
    assert e.severity == "high"
    assert describe(e).startswith("No production reported")


def test_ramp_up_months_are_not_judged():
    rates = declining(30)
    rates[6] *= 2
    e = judge(field(rates), 6)
    assert e.excluded_reason == "ramp-up"
    assert not e.is_anomaly


def test_last_year_of_a_field_now_shut_down_is_not_judged():
    rates = declining(48)
    rates[45] *= 0.3
    e = judge(field(rates, status="Shut down"), 45)
    assert e.excluded_reason == "shut-down transition"


def test_small_fields_are_not_judged():
    rates = declining(48, start=900)
    rates[40] *= 0.5
    e = judge(field(rates), 40)
    assert e.excluded_reason == "small field"
    assert not e.is_anomaly


def test_too_little_history_after_a_long_stop_is_not_judged():
    rates = declining(48)
    for i in range(30, 40):
        rates[i] = 0.0
    e = judge(field(rates), 41)
    assert e.excluded_reason == "too little history"


def test_flag_and_band_always_agree():
    rng = np.random.default_rng(11)
    for _ in range(20):
        rates = declining(40, noise=float(rng.uniform(0.005, 0.1)))
        rates[39] *= float(rng.uniform(0.5, 1.5))
        e = judge(field(rates), 39)
        outside = e.actual_boe_d < e.lo_boe_d or e.actual_boe_d > e.hi_boe_d
        assert e.is_anomaly == outside


@pytest.mark.parametrize(
    ("gap_boe_d", "expected"),
    [(-2_500, "low"), (2_999, "low"), (-3_000, "medium"), (9_000, "medium"), (-12_000, "high")],
)
def test_severity_is_the_size_of_the_miss_in_barrels_a_day(gap_boe_d, expected):
    assert severity(gap_boe_d, PARAMS) == expected


def test_full_outage_of_a_small_field_is_low_severity():
    rates = declining(48, start=3_000)
    rates[40] = 0.0
    e = judge(field(rates), 40)
    assert e.is_anomaly
    assert e.severity == "low"
