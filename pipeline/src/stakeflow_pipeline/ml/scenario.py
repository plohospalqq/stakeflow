"""Share-price sensitivities for the what-if scenario explorer. Not a forecast.

    monthly log return of the share =
        a + b_brent * Brent + b_ttf * TTF + b_production * production + b_eurusd * EUR/USD + e

Every regressor is a monthly log change: Brent (EIA, USD), TTF (World Bank, EUR/MWh), the
company's Sodir-attributed production (boe/d) and EUR/USD (ECB). Prices are monthly averages
of daily values, because TTF only exists as a monthly average; the share uses the same
averaging so all sides of the equation cover the same days.

Plain OLS, so every number can be shown: coefficients with standard errors, R², residual
spread, sample window and size. A scenario applies the coefficients to the changes a user
picks; the band adds coefficient uncertainty (the covariance matrix) and the residual noise the
model cannot explain. The intercept (past drift) is never projected: a scenario shows the
response to the assumptions only, so "everything flat" means a central change of zero.

No market factor: no free index licence covers automated use (OSEBX is Euronext data), and
Equinor is about a fifth of OSEBX, so regressing it on the index would be circular.

The backtest asks how well the drivers *explained* past quarters, given what Brent, TTF,
production and EUR/USD actually did: in-sample, and out of sample with an expanding window
(fit on months before the quarter only). It measures explanatory power, not foresight.
"""

import math
from dataclasses import dataclass
from datetime import date
from itertools import pairwise

import numpy as np

from stakeflow_pipeline.ml.robust import Vector

MODEL_VERSION = "share-scenario-0.1.0"
DRIVERS = ("brent", "ttf", "production", "eurusd")
TERMS = ("intercept", *DRIVERS)
MIN_OBS = 18
MIN_TRAIN_MONTHS = 12
# Below this many out-of-sample quarters an R² or a band coverage is noise, not evidence
MIN_SCORED_QUARTERS = 4
# A production change this large in one month is an acquisition or a big start-up, a step in
# the portfolio rather than a market signal (Aker BP + Lundin, July 2022: +40%)
MAX_PRODUCTION_STEP = 0.30
Z80 = 1.2815515655446004  # two-sided 80% normal quantile


@dataclass(frozen=True)
class MonthlyInputs:
    """Monthly levels; None where the month has no complete value."""

    month: date
    share: float | None
    brent: float | None
    ttf: float | None
    production: float | None
    eurusd: float | None


@dataclass(frozen=True)
class Fit:
    estimates: Vector
    covariance: Vector  # k x k
    resid_std: float
    r2: float
    adj_r2: float
    n: int
    # Spread of each regressor's monthly change in the sample: lets a scenario be flagged as
    # an extrapolation when it asks for a move far outside anything the model was fitted on
    x_sd: Vector

    def predict(self, x: Vector) -> Vector:
        return x @ self.estimates


@dataclass(frozen=True)
class BacktestQuarter:
    quarter_start: date
    actual: float
    fitted: float
    oos: float | None
    oos_lo: float | None
    oos_hi: float | None
    train_months: int | None


@dataclass(frozen=True)
class ScenarioModel:
    status: str  # "ok" | "insufficient_data"
    status_note: str | None
    months: list[date]
    excluded: dict[str, str]  # month (ISO) -> reason
    fit: Fit | None
    backtest: list[BacktestQuarter]
    r2_in_sample_quarterly: float | None
    r2_out_of_sample_quarterly: float | None
    band_coverage: float | None


def ols(x: Vector, y: Vector) -> Fit:
    n, k = x.shape
    xtx_inv = np.linalg.inv(x.T @ x)
    estimates = xtx_inv @ x.T @ y
    resid = y - x @ estimates
    rss = float(resid @ resid)
    tss = float(((y - y.mean()) ** 2).sum())
    s2 = rss / (n - k)
    r2 = 1 - rss / tss if tss > 0 else 0.0
    return Fit(
        estimates=estimates,
        covariance=s2 * xtx_inv,
        resid_std=float(np.sqrt(s2)),
        r2=r2,
        adj_r2=1 - (1 - r2) * (n - 1) / (n - k),
        n=n,
        x_sd=x.std(axis=0, ddof=1),
    )


def monthly_returns(
    rows: list[MonthlyInputs],
) -> tuple[list[date], Vector, Vector, dict[str, str]]:
    """Design matrix (intercept + driver log changes) and share log returns, consecutive
    complete months only. Returns (months, X, y, excluded months with reasons)."""
    months: list[date] = []
    x_rows: list[list[float]] = []
    y: list[float] = []
    excluded: dict[str, str] = {}
    for prev, cur in pairwise(rows):
        prev_levels, cur_levels = _levels(prev), _levels(cur)
        if _month_number(cur.month) - _month_number(prev.month) != 1:
            continue
        if prev_levels is None or cur_levels is None:
            continue
        changes = [math.log(c / p) for p, c in zip(prev_levels, cur_levels, strict=True)]
        share, drivers = changes[0], changes[1:]
        if abs(drivers[DRIVERS.index("production")]) > MAX_PRODUCTION_STEP:
            excluded[cur.month.isoformat()] = "production step over 30% (portfolio change)"
            continue
        months.append(cur.month)
        x_rows.append([1.0, *drivers])
        y.append(share)
    return months, np.array(x_rows).reshape(-1, len(TERMS)), np.array(y), excluded


def fit_scenario_model(rows: list[MonthlyInputs]) -> ScenarioModel:
    months, x, y, excluded = monthly_returns(rows)
    if len(months) < MIN_OBS:
        return ScenarioModel(
            "insufficient_data",
            f"{len(months)} complete monthly returns; the model needs at least {MIN_OBS}",
            months,
            excluded,
            None,
            [],
            None,
            None,
            None,
        )
    fit = ols(x, y)
    quarters = _backtest(months, x, y, fit)
    return ScenarioModel(
        "ok",
        None,
        months,
        excluded,
        fit,
        quarters,
        _r2([q.actual for q in quarters], [q.fitted for q in quarters]),
        _oos_r2(quarters, months, y),
        _coverage(quarters),
    )


def _backtest(months: list[date], x: Vector, y: Vector, fit: Fit) -> list[BacktestQuarter]:
    fitted = fit.predict(x)
    by_quarter: dict[date, list[int]] = {}
    for i, m in enumerate(months):
        by_quarter.setdefault(date(m.year, 3 * ((m.month - 1) // 3) + 1, 1), []).append(i)

    quarters: list[BacktestQuarter] = []
    for start, rows in sorted(by_quarter.items()):
        if len(rows) != 3:
            continue
        train = [i for i, m in enumerate(months) if m < start]
        oos = lo = hi = None
        if len(train) >= max(MIN_TRAIN_MONTHS, len(TERMS) + 2):
            train_fit = ols(x[train], y[train])
            xq = x[rows].sum(axis=0)
            oos = float(xq @ train_fit.estimates)
            sd = float(np.sqrt(xq @ train_fit.covariance @ xq + 3 * train_fit.resid_std**2))
            lo, hi = oos - Z80 * sd, oos + Z80 * sd
        quarters.append(
            BacktestQuarter(
                start,
                float(y[rows].sum()),
                float(fitted[rows].sum()),
                oos,
                lo,
                hi,
                len(train) if oos is not None else None,
            )
        )
    return quarters


def _r2(actual: list[float], predicted: list[float]) -> float | None:
    if len(actual) < 2:
        return None
    a, p = np.array(actual), np.array(predicted)
    tss = float(((a - a.mean()) ** 2).sum())
    return 1 - float(((a - p) ** 2).sum()) / tss if tss > 0 else None


def _oos_r2(quarters: list[BacktestQuarter], months: list[date], y: Vector) -> float | None:
    """1 - SSE(model) / SSE(training-mean benchmark), the usual out-of-sample R².

    Negative means the drivers explained past quarters worse than "average return so far".
    """
    scored = [q for q in quarters if q.oos is not None]
    if len(scored) < MIN_SCORED_QUARTERS:
        return None
    sse_model = sum((q.actual - q.oos) ** 2 for q in scored if q.oos is not None)
    sse_bench = 0.0
    for q in scored:
        train = [y[i] for i, m in enumerate(months) if m < q.quarter_start]
        sse_bench += (q.actual - 3 * float(np.mean(train))) ** 2
    return 1 - sse_model / sse_bench if sse_bench > 0 else None


def _coverage(quarters: list[BacktestQuarter]) -> float | None:
    bands = [(q.oos_lo, q.actual, q.oos_hi) for q in quarters]
    scored = [(lo, a, hi) for lo, a, hi in bands if lo is not None and hi is not None]
    if len(scored) < MIN_SCORED_QUARTERS:
        return None
    return sum(1 for lo, a, hi in scored if lo <= a <= hi) / len(scored)


def _levels(row: MonthlyInputs) -> list[float] | None:
    """Share then drivers in DRIVERS order, or None if any is missing or not positive."""
    raw = (row.share, row.brent, row.ttf, row.production, row.eurusd)
    levels = [v for v in raw if v is not None and v > 0]
    return levels if len(levels) == len(raw) else None


def _month_number(d: date) -> int:
    return d.year * 12 + d.month
