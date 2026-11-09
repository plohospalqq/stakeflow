"""The one shape every market source is parsed into before it is stored."""

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Any


class MarketDataError(RuntimeError):
    pass


@dataclass(frozen=True)
class Observation:
    """One value of one series on one date (monthly series use the first day of the month)."""

    series: str
    date: date
    value: float
    unit: str
    extra: dict[str, Any] = field(default_factory=dict)

    def to_attributes(self) -> dict[str, Any]:
        return {
            "series": self.series,
            "date": self.date.isoformat(),
            "value": self.value,
            "unit": self.unit,
            **self.extra,
        }


def validate(observations: list[Observation], source: str) -> None:
    """Refuse a load that is empty, non-finite, non-positive or has duplicate keys.

    Prices and exchange rates are always > 0; anything else is a parsing or unit bug.
    """
    if not observations:
        raise MarketDataError(f"{source}: no observations")
    seen: set[tuple[str, date]] = set()
    for obs in observations:
        if not math.isfinite(obs.value) or obs.value <= 0:
            raise MarketDataError(f"{source}: bad value {obs.value!r} for {obs.series} {obs.date}")
        key = (obs.series, obs.date)
        if key in seen:
            raise MarketDataError(f"{source}: duplicate {obs.series} {obs.date}")
        seen.add(key)
