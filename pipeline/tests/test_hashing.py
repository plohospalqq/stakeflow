"""Hashes are deterministic, cover every published field, and can be checked from the JSON."""

import hashlib
import json
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from stakeflow_pipeline.forecast.hashing import canonical_json, iso_utc, sha256_hex
from stakeflow_pipeline.forecast.predictions import Prediction

INPUTS = {
    "model_version": "nowcast-1.0.0",
    "group_id": "aker-bp",
    "quarter_start": "2026-10-01",
    "data_through": "2026-08-01",
    "ingestion_run_ids": {"profiles": "7ab0f77c-1a89-474d-bf53-1a3691216f2e"},
    "data_sha256": "0" * 64,
}


def prediction(**changes) -> Prediction:
    base = Prediction(
        id="2b1f3c38-7e1a-4bb4-9a8f-0d3c3a6c1e11",
        group_id="aker-bp",
        quarter_start=date(2026, 10, 1),
        predicted_at=datetime(2026, 12, 31, 22, 0, 5, tzinfo=UTC),
        as_of=date(2026, 12, 31),
        data_through=date(2026, 9, 1),
        months_in_data=0,
        value_kboe_d=371.2,
        lo=352.0,
        hi=390.4,
        model_version="nowcast-1.0.0",
        kind="live",
        inputs=INPUTS,
    )
    return replace(base, **changes)


def test_canonical_json_ignores_key_order_and_whitespace():
    assert (
        canonical_json({"b": 1, "a": [1, {"d": 2, "c": "æ"}]}) == '{"a":[1,{"c":"æ","d":2}],"b":1}'
    )
    assert sha256_hex({"a": 1, "b": 2}) == sha256_hex({"b": 2, "a": 1})


def test_sha256_matches_a_known_vector():
    assert sha256_hex({"a": 1}) == hashlib.sha256(b'{"a":1}').hexdigest()


def test_nan_cannot_be_hashed():
    with pytest.raises(ValueError):
        canonical_json({"value": float("nan")})


def test_timestamps_are_hashed_in_utc_to_the_second():
    oslo_winter = timezone(timedelta(hours=1))
    local = datetime(2026, 12, 31, 23, 0, 5, tzinfo=oslo_winter)
    assert iso_utc(local) == "2026-12-31T22:00:05Z"
    with pytest.raises(ValueError):
        iso_utc(datetime(2026, 12, 31, 22, 0, 5))


def test_same_prediction_same_hash():
    assert prediction().prediction_hash == prediction().prediction_hash


@pytest.mark.parametrize(
    "change",
    [
        {"value_kboe_d": 371.3},
        {"lo": 351.9},
        {"hi": 390.5},
        {"predicted_at": datetime(2026, 12, 31, 22, 0, 6, tzinfo=UTC)},
        {"group_id": "var-energi"},
        {"kind": "backtest"},
        {"months_in_data": 1},
        {"inputs": {**INPUTS, "data_through": "2026-09-01"}},
    ],
)
def test_any_change_changes_the_prediction_hash(change):
    assert prediction(**change).prediction_hash != prediction().prediction_hash


def test_published_record_verifies_the_way_the_docs_describe():
    published = json.loads(canonical_json(prediction().public_record()))
    inputs = published.pop("inputs")
    claimed = published.pop("prediction_hash")
    assert hashlib.sha256(canonical_json(inputs).encode()).hexdigest() == published["input_hash"]
    assert hashlib.sha256(canonical_json(published).encode()).hexdigest() == claimed


def test_values_are_rounded_before_hashing():
    noisy = prediction(value_kboe_d=371.2000000001)
    assert noisy.payload()["value_kboe_d"] == 371.2
    assert noisy.prediction_hash == prediction().prediction_hash


def test_sub_second_timestamps_are_rejected_at_creation():
    from stakeflow_pipeline.forecast.nowcast import QuarterNowcast
    from stakeflow_pipeline.forecast.periods import Quarter

    nowcast = QuarterNowcast("aker-bp", Quarter.parse("2026Q4"), date(2026, 8, 1), 0, 1, 0, 2)
    with pytest.raises(ValueError, match="whole seconds"):
        Prediction.from_nowcast(
            nowcast,
            kind="live",
            model_version="nowcast-1.0.0",
            predicted_at=datetime(2026, 11, 9, 12, 0, 0, 500, tzinfo=UTC),
            as_of=date(2026, 11, 9),
            inputs=INPUTS,
        )
