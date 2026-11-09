"""Canonical JSON and SHA-256: the public proof that a prediction was not edited afterwards.

Canonical form: keys sorted, no whitespace, UTF-8, no NaN. Values are limited to strings,
integers, floats rounded before hashing, booleans, null, lists and objects, so the same
prediction always serialises to the same bytes, whether it comes from Python, the database or
a JSON file in the repo. Anyone can check a published file with:

    python -c "import hashlib, json, sys; d = json.load(open(sys.argv[1])); \
inputs = d.pop('inputs'); h = d.pop('prediction_hash'); \
c = lambda o: json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False); \
print(hashlib.sha256(c(inputs).encode()).hexdigest() == d['input_hash'], \
hashlib.sha256(c(d).encode()).hexdigest() == h)" predictions/2026Q4/aker-bp.json
"""

import hashlib
import json
from datetime import UTC, date, datetime
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def iso_date(value: date) -> str:
    return value.isoformat()


def iso_utc(value: datetime) -> str:
    """UTC timestamp to the second, 'Z' suffix: the only timestamp format we hash."""
    if value.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
