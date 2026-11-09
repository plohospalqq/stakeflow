"""One row of the public prediction log, and the two hashes that make it tamper-evident.

- `input_hash`  = sha256(canonical JSON of `inputs`): model versions, the quarter, the newest
  Sodir month used, the raw snapshot (ingestion run) ids and a digest of the exact numbers the
  model saw. Same inputs, same hash.
- `prediction_hash` = sha256(canonical JSON of the row without `prediction_hash` and
  `inputs`). The row already carries `input_hash`, so this one hash covers both.

Rows are never updated: a revision is a new row with a new id. The GitHub workflow commits the
quarter's live rows as JSON at quarter end; the commit time is the public timestamp.

Kinds:
- `live`: made from the data we actually had at `predicted_at`.
- `backtest`: replayed later from the data we have today, truncated to what would have been
  published by `as_of` (the quarter end). We keep a single vintage of history, so Sodir's later
  revisions to old months leak into these rows; they are labelled and scored separately.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal

from stakeflow_pipeline.forecast.hashing import iso_date, iso_utc, sha256_hex
from stakeflow_pipeline.forecast.nowcast import QuarterNowcast

Kind = Literal["live", "backtest"]


@dataclass(frozen=True)
class Prediction:
    group_id: str
    quarter_start: date
    predicted_at: datetime
    as_of: date
    data_through: date
    months_in_data: int
    value_kboe_d: float
    lo: float
    hi: float
    model_version: str
    kind: Kind
    inputs: dict[str, Any]
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    @property
    def input_hash(self) -> str:
        return sha256_hex(self.inputs)

    def payload(self) -> dict[str, Any]:
        """The hashed fields, JSON-ready. Keep in sync with `ml.predictions`."""
        return {
            "id": self.id,
            "group_id": self.group_id,
            "quarter_start": iso_date(self.quarter_start),
            "predicted_at": iso_utc(self.predicted_at),
            "as_of": iso_date(self.as_of),
            "data_through": iso_date(self.data_through),
            "months_in_data": self.months_in_data,
            "value_kboe_d": round(self.value_kboe_d, 1),
            "lo": round(self.lo, 1),
            "hi": round(self.hi, 1),
            "model_version": self.model_version,
            "kind": self.kind,
            "input_hash": self.input_hash,
        }

    @property
    def prediction_hash(self) -> str:
        return sha256_hex(self.payload())

    def public_record(self) -> dict[str, Any]:
        """What gets published: the payload, its hash and the inputs behind `input_hash`."""
        return {**self.payload(), "prediction_hash": self.prediction_hash, "inputs": self.inputs}

    def db_row(self, run_id: str | None) -> dict[str, Any]:
        return {
            "id": self.id,
            "group_id": self.group_id,
            "quarter_start": self.quarter_start,
            "predicted_at": self.predicted_at,
            "as_of": self.as_of,
            "data_through": self.data_through,
            "months_in_data": self.months_in_data,
            "value_kboe_d": round(self.value_kboe_d, 1),
            "lo": round(self.lo, 1),
            "hi": round(self.hi, 1),
            "model_version": self.model_version,
            "kind": self.kind,
            "input_hash": self.input_hash,
            "prediction_hash": self.prediction_hash,
            "inputs": self.inputs,
            "run_id": run_id,
        }

    @classmethod
    def from_nowcast(
        cls,
        nowcast: QuarterNowcast,
        *,
        kind: Kind,
        model_version: str,
        predicted_at: datetime,
        as_of: date,
        inputs: dict[str, Any],
    ) -> "Prediction":
        if predicted_at.microsecond:
            raise ValueError("predicted_at must be whole seconds (it is hashed to the second)")
        return cls(
            group_id=nowcast.group_id,
            quarter_start=nowcast.quarter.start,
            predicted_at=predicted_at,
            as_of=as_of,
            data_through=nowcast.data_through,
            months_in_data=nowcast.months_in_data,
            value_kboe_d=nowcast.value_kboe_d,
            lo=nowcast.lo,
            hi=nowcast.hi,
            model_version=model_version,
            kind=kind,
            inputs=inputs,
        )

    @classmethod
    def from_db(cls, row: dict[str, Any]) -> "Prediction":
        """Rebuild from an `ml.predictions` row (to export it or to re-check its hash)."""
        return cls(
            id=str(row["id"]),
            group_id=row["group_id"],
            quarter_start=row["quarter_start"],
            predicted_at=row["predicted_at"],
            as_of=row["as_of"],
            data_through=row["data_through"],
            months_in_data=row["months_in_data"],
            value_kboe_d=float(row["value_kboe_d"]),
            lo=float(row["lo"]),
            hi=float(row["hi"]),
            model_version=row["model_version"],
            kind=row["kind"],
            inputs=row["inputs"],
        )
