"""Anomalies in monthly field production: months far from what the field's own recent history
says to expect.

Expected value for month t uses only months before t (no look-ahead):

1. Work in log(boe/d): a 10% drop means the same on a big and a small field, and boe/d makes
   28- and 31-day months comparable.
2. Trend: a Theil-Sen line through the previous 12 producing months, extended to t. Fields
   decline, so a flat median would call every normal month a drop; Theil-Sen ignores a few
   outage months that a least-squares line would chase.
3. Seasonality (gas offtake is higher in winter), as a second candidate: the median residual
   per calendar month over the previous 36 months, added to a deseasonalised trend.
4. Uncertainty: how wrong the same one-month-ahead forecast was over the previous 24 months
   (robust sigma, MAD, of those errors). This is the honest spread: residuals around a fitted
   line are always smaller than real forecast errors. The seasonal candidate is used only when
   its past errors were clearly smaller, so seasonality is earned out of sample.

A month is an anomaly when it is more than 10% AND more than 3 sigmas from expected. The band
[lo, hi] is exactly the range where that does not hold, so on a chart a point outside the band
is a flagged month. Ramp-up (first 12 months), the last year of a field that is now shut down,
fields expected below 1,000 boe/d and months with too little history are not judged. Severity
is the size of the miss in boe/d (high from 10,000, medium from 3,000).
"""

import math
from dataclasses import dataclass, replace
from datetime import date

import numpy as np
from numpy.typing import NDArray

from stakeflow_pipeline.ml.robust import Vector, robust_sigma, theil_sen

IntVector = NDArray[np.int64]
BoolVector = NDArray[np.bool_]

MODEL_VERSION = "anomaly-0.2.0"


@dataclass(frozen=True)
class AnomalyParams:
    pct_threshold: float = 0.10
    sigma_threshold: float = 3.0
    trend_months: int = 12
    min_trend_points: int = 9
    season_months: int = 36
    min_season_points: int = 30
    # How far back past forecast errors are used to size the band
    error_months: int = 24
    min_error_points: int = 12
    # Seasonal candidate must have had at least this much smaller past errors to be used
    min_season_gain: float = 0.10
    sigma_floor: float = 0.02
    ramp_up_months: int = 12
    shutdown_tail_months: int = 12
    min_expected_boe_d: float = 1000.0
    # Severity is the size of the miss in barrels a day: what it means for the owners.
    # A 100% outage on a 2,000 boe/d field matters less than -15% on a 100,000 boe/d one.
    high_gap_boe_d: float = 10_000.0
    medium_gap_boe_d: float = 3_000.0


@dataclass(frozen=True)
class FieldHistory:
    field_id: int
    months: list[date]  # sorted, one per month with a Sodir row
    boe_per_day: list[float]
    status: str
    first_production_month: date | None
    last_production_month: date | None


@dataclass(frozen=True)
class Evaluation:
    field_id: int
    month: date
    actual_boe_d: float
    expected_boe_d: float | None = None
    lo_boe_d: float | None = None
    hi_boe_d: float | None = None
    sigma_log: float | None = None
    pct_vs_expected: float | None = None
    seasonal: bool = False
    is_anomaly: bool = False
    severity: str | None = None
    excluded_reason: str | None = None


def month_index(d: date) -> int:
    return d.year * 12 + d.month - 1


def add_months(d: date, months: int) -> date:
    i = month_index(d) + months
    return date(i // 12, i % 12 + 1, 1)


def severity(gap_boe_d: float, params: AnomalyParams) -> str:
    size = abs(gap_boe_d)
    if size >= params.high_gap_boe_d:
        return "high"
    return "medium" if size >= params.medium_gap_boe_d else "low"


class _Series:
    """One field's history as arrays, with one-month-ahead log forecasts per month index."""

    def __init__(self, history: FieldHistory, params: AnomalyParams) -> None:
        self.params = params
        self.idx: IntVector = np.array([month_index(m) for m in history.months], dtype=np.int64)
        rate = np.array(history.boe_per_day, dtype=float)
        self.producing: BoolVector = rate > 0
        self.log_rate: Vector = np.log(np.where(self.producing, rate, 1.0))
        self.position = {int(i): p for p, i in enumerate(self.idx)}
        self._cache: dict[tuple[int, bool], float | None] = {}

    def forecast(self, t: int, seasonal: bool) -> float | None:
        key = (t, seasonal)
        if key not in self._cache:
            self._cache[key] = self._forecast(t, seasonal)
        return self._cache[key]

    def _forecast(self, t: int, seasonal: bool) -> float | None:
        p, idx = self.params, self.idx
        calendar = idx % 12
        in_trend = self.producing & (idx >= t - p.trend_months) & (idx < t)
        if in_trend.sum() < p.min_trend_points:
            return None
        season = np.zeros(12)
        if seasonal:
            in_season = self.producing & (idx >= t - p.season_months) & (idx < t)
            if in_season.sum() < p.min_season_points:
                return None
            x, y = (idx[in_season] - t).astype(float), self.log_rate[in_season]
            slope, intercept = theil_sen(x, y)
            residual, months = y - (intercept + slope * x), calendar[in_season]
            season = np.array(
                [
                    np.median(residual[months == m]) if (months == m).any() else 0.0
                    for m in range(12)
                ]
            )
            season -= season.mean()
        x = (idx[in_trend] - t).astype(float)
        slope, intercept = theil_sen(x, self.log_rate[in_trend] - season[calendar[in_trend]])
        # x = 0 is month t itself, so the intercept is the trend's value at t
        return intercept + float(season[t % 12])

    def past_error_sigma(self, t: int, seasonal: bool) -> float | None:
        errors = []
        for m in range(t - self.params.error_months, t):
            pos = self.position.get(m)
            if pos is None or not self.producing[pos]:
                continue
            forecast = self.forecast(m, seasonal)
            if forecast is not None:
                errors.append(self.log_rate[pos] - forecast)
        if len(errors) < self.params.min_error_points:
            return None
        return robust_sigma(np.array(errors))


def _exclusion(history: FieldHistory, month: date, params: AnomalyParams) -> str | None:
    first, last = history.first_production_month, history.last_production_month
    if first is None or month < first:
        return "not producing yet"
    if month < add_months(first, params.ramp_up_months):
        return "ramp-up"
    if (
        history.status == "Shut down"
        and last is not None
        and month > add_months(last, -params.shutdown_tail_months)
    ):
        return "shut-down transition"
    return None


def evaluate_field(
    history: FieldHistory, months: list[date], params: AnomalyParams
) -> list[Evaluation]:
    """Judge each of `months` against the field's own history before it."""
    series = _Series(history, params)
    actual_by_month = dict(zip(history.months, history.boe_per_day, strict=True))
    evaluations: list[Evaluation] = []
    for month in months:
        actual = actual_by_month.get(month)
        if actual is None:
            continue
        base = Evaluation(history.field_id, month, actual)
        reason = _exclusion(history, month, params)
        if reason:
            evaluations.append(replace(base, excluded_reason=reason))
            continue

        t = month_index(month)
        log_expected, sigma = series.forecast(t, False), series.past_error_sigma(t, False)
        if log_expected is None or sigma is None:
            evaluations.append(replace(base, excluded_reason="too little history"))
            continue
        use_seasonal = False
        seasonal_expected, seasonal_sigma = (
            series.forecast(t, True),
            series.past_error_sigma(t, True),
        )
        if (
            seasonal_expected is not None
            and seasonal_sigma is not None
            and seasonal_sigma < (1 - params.min_season_gain) * sigma
        ):
            log_expected, sigma, use_seasonal = seasonal_expected, seasonal_sigma, True
        sigma = max(sigma, params.sigma_floor)

        expected = math.exp(log_expected)
        band = params.sigma_threshold * sigma
        lo = expected * min(1 - params.pct_threshold, math.exp(-band))
        hi = expected * max(1 + params.pct_threshold, math.exp(band))
        pct = actual / expected - 1
        judged = replace(
            base,
            expected_boe_d=expected,
            lo_boe_d=lo,
            hi_boe_d=hi,
            sigma_log=sigma,
            pct_vs_expected=pct,
            seasonal=use_seasonal,
        )
        if expected < params.min_expected_boe_d:
            evaluations.append(replace(judged, excluded_reason="small field"))
        elif actual < lo or actual > hi:
            size = severity(actual - expected, params)
            evaluations.append(replace(judged, is_anomaly=True, severity=size))
        else:
            evaluations.append(judged)
    return evaluations


def describe(evaluation: Evaluation) -> str:
    """Plain-language note shown with an anomaly."""
    if evaluation.expected_boe_d is None or evaluation.pct_vs_expected is None:
        return ""
    expected = evaluation.expected_boe_d / 1000
    actual = evaluation.actual_boe_d / 1000
    basis = "recent trend and seasonal pattern" if evaluation.seasonal else "recent trend"
    if actual == 0:
        return (
            f"No production reported this month, against about {expected:.1f} thousand barrels "
            f"of oil equivalent a day expected from the field's {basis}."
        )
    direction = "below" if evaluation.pct_vs_expected < 0 else "above"
    return (
        f"Output was {abs(evaluation.pct_vs_expected):.0%} {direction} what the field's {basis} "
        f"suggested: {actual:.1f} thousand barrels of oil equivalent a day against about "
        f"{expected:.1f}."
    )
