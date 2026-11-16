"""The forecast run without a database: replayed quarters, calibration and the manifest."""

from datetime import UTC, date, datetime

import numpy as np
import pytest

from stakeflow_pipeline.forecast import calibration, run
from stakeflow_pipeline.forecast.nowcast import OPEN_END, OwnershipPeriod
from stakeflow_pipeline.forecast.periods import Quarter, add_months, days_in_month, months_between
from stakeflow_pipeline.forecast.store import Inputs

FIRST = date(2021, 1, 1)
LATEST = date(2025, 6, 1)
GROUP = "aker-bp"


def make_inputs(noise: float = 0.04) -> Inputs:
    """Two steady fields held 50% by one group, with the group's observed volumes."""
    rng = np.random.default_rng(7)
    months = months_between(FIRST, LATEST)
    field_volumes: dict[int, dict[date, float]] = {}
    for field_id, rate in ((1, 20_000.0), (2, 8_000.0)):
        field_volumes[field_id] = {
            m: rate * days_in_month(m) * float(np.exp(rng.normal(0, noise))) for m in months
        }
    group = {m: 0.5 * sum(v[m] for v in field_volumes.values()) for m in months}
    return Inputs(
        latest_month=LATEST,
        field_volumes=field_volumes,
        group_volumes={GROUP: group},
        ownership=[OwnershipPeriod(f, GROUP, FIRST, OPEN_END, 50.0) for f in (1, 2)],
        focus_groups=[GROUP],
        ingestion_run_ids={"profiles": "run-1"},
    )


@pytest.fixture(scope="module")
def inputs() -> Inputs:
    return make_inputs()


@pytest.fixture(scope="module")
def calibrator(inputs: Inputs) -> run.RangeCalibrator:
    return run.RangeCalibrator(inputs, first=Quarter.parse("2023Q1"))


def test_a_backtest_only_sees_months_published_by_the_quarter_end(inputs, calibrator):
    quarter = Quarter.parse("2024Q1")
    raw = calibrator.backtest(quarter)
    # 69 days of lag: at the end of March the newest month surely out is December
    assert raw.data_through == date(2023, 12, 1)
    assert max(raw.series[1].months) == raw.data_through
    result = raw.results[GROUP]
    assert result.months_in_data == 0
    assert result.value_kboe_d == pytest.approx(
        run.attributed_kboe_d(inputs, GROUP, quarter), rel=0.1
    )
    assert calibrator.backtest(quarter) is raw  # replayed once, reused


def test_calibration_never_uses_a_quarter_whose_actual_was_not_known(calibrator):
    # Frozen with data through Dec 2023: 2023Q1-Q4 are known, 2024Q1 is not
    assert len(calibrator.scores(date(2023, 12, 1))) == 4
    assert len(calibrator.scores(date(2024, 2, 1))) == 4
    assert len(calibrator.scores(date(2024, 3, 1))) == 5
    assert calibrator.scores(add_months(date(2023, 3, 1), -1)) == []


def test_the_published_range_is_the_simulated_one_widened_and_says_by_how_much(inputs, calibrator):
    quarter = Quarter.parse("2025Q1")
    raw = calibrator.backtest(quarter)
    simulated = raw.results[GROUP]
    scores = [0.5] * 9 + [1.5, 2.0, 2.5]
    widen_by = calibration.factor(scores)
    assert widen_by > 1

    (prediction,) = run.predict_quarter(
        inputs,
        raw,
        scores,
        kind="backtest",
        as_of=quarter.end,
        predicted_at=datetime(2026, 11, 16, tzinfo=UTC),
    )
    assert prediction.value_kboe_d == simulated.value_kboe_d
    assert prediction.lo < simulated.lo < simulated.hi < prediction.hi
    lo, hi = calibration.widen(simulated.lo, simulated.value_kboe_d, simulated.hi, widen_by)
    assert (prediction.lo, prediction.hi) == (round(lo, 1), round(hi, 1))
    assert prediction.inputs["range_calibration"] == {"factor": round(widen_by, 4), "scores": 12}

    # Too little history to learn from: the range stays as simulated, and the row says so
    (plain,) = run.predict_quarter(
        inputs,
        raw,
        [],
        kind="backtest",
        as_of=quarter.end,
        predicted_at=datetime(2026, 11, 16, tzinfo=UTC),
    )
    assert (plain.lo, plain.hi) == (simulated.lo, simulated.hi)
    assert plain.inputs["range_calibration"] == {"factor": 1.0, "scores": 0}
    assert plain.input_hash != prediction.input_hash
