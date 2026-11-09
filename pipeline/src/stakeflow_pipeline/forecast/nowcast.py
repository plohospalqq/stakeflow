"""Quarterly company nowcast: Sodir months where we have them, field forecasts for the rest.

For one company group and quarter:

    quarter volume = Σ observed months (Sodir, day-weighted shares, from the marts)
                   + Σ forecast months Σ fields  field forecast x group share that month

and kboe/d = volume x 6.2898 ÷ days in the quarter ÷ 1000, the same definition as
`fct_quarterly_reconciliation`, so a nowcast and the later Sodir-attributed figure compare 1:1.

Shares for forecast months are day-weighted from the ownership rows known at the freeze date:
a deal that closed before it counts from its closing day; a row that ended after it is treated
as still open, because at the time nobody knew it would end.

Range: each field contributes its simulated paths, and the quarter total is summed draw by draw
(draw j of every field). Fields are simulated independently, so this assumes field errors are
independent. They are not fully: a gas-processing outage at Kårstø or Kollsnes, or a start-up
the decline model cannot see, moves many fields or a whole company at once. Measured on 42
quarterly backtests against Sodir-attributed actuals (2023Q1-2026Q2): independent sums give a
range ~13% wide that held the actual 64% of the time; perfectly correlated sums (sorted draws)
a ~40% range that held it 98% of the time. The truth is in between; we publish the independent
range and its measured hit rate rather than tune a correlation on 42 points.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date

import numpy as np

from stakeflow_pipeline.forecast.field_model import INTERVAL, FieldForecast
from stakeflow_pipeline.forecast.periods import Quarter, add_months, days_in_month

MODEL_VERSION = "nowcast-1.0.0"
BBL_PER_SM3 = 6.2898
OPEN_END = date(9999, 12, 31)


@dataclass(frozen=True)
class OwnershipPeriod:
    """One row of marts.fct_field_ownership. valid_to is exclusive."""

    field_id: int
    group_id: str
    valid_from: date
    valid_to: date
    share_pct: float


@dataclass(frozen=True)
class QuarterNowcast:
    group_id: str
    quarter: Quarter
    data_through: date
    months_in_data: int
    value_kboe_d: float
    lo: float
    hi: float


def group_shares(
    ownership: Iterable[OwnershipPeriod], group_id: str, months: list[date], known_at: date
) -> dict[tuple[int, date], float]:
    """Day-weighted share (0-1) of `group_id` per (field, month), as known on `known_at`."""
    shares: dict[tuple[int, date], float] = {}
    for row in ownership:
        if row.group_id != group_id or row.valid_from > known_at:
            continue
        valid_to = row.valid_to if row.valid_to <= known_at else OPEN_END
        for month in months:
            next_month = add_months(month, 1)
            held = (min(valid_to, next_month) - max(row.valid_from, month)).days
            if held <= 0:
                continue
            key = (row.field_id, month)
            weight = row.share_pct / 100 * held / days_in_month(month)
            shares[key] = shares.get(key, 0.0) + weight
    return shares


def nowcast_quarter(
    group_id: str,
    quarter: Quarter,
    data_through: date,
    observed_oe_sm3: Mapping[date, float],
    forecasts: Mapping[int, FieldForecast],
    shares: Mapping[tuple[int, date], float],
    draws: int,
) -> QuarterNowcast:
    total = np.zeros(draws)
    for month in quarter.months:
        if month <= data_through:
            total += observed_oe_sm3.get(month, 0.0)
            continue
        for (field_id, share_month), share in shares.items():
            forecast = forecasts.get(field_id)
            if share_month != month or forecast is None:
                continue
            total += forecast.draws[:, forecast.months.index(month)] * share
    kboe_d = total * BBL_PER_SM3 / quarter.days / 1000
    lo, mid, hi = (round(float(v), 1) for v in np.percentile(kboe_d, INTERVAL))
    return QuarterNowcast(
        group_id=group_id,
        quarter=quarter,
        data_through=data_through,
        months_in_data=sum(m <= data_through for m in quarter.months),
        value_kboe_d=mid,
        lo=min(lo, mid),
        hi=max(hi, mid),
    )


def months_needed(quarter: Quarter, data_through: date) -> int:
    """Forecast horizon from the month after `data_through` to the end of the quarter."""
    last = quarter.months[-1]
    return max(0, (last.year - data_through.year) * 12 + last.month - data_through.month)
