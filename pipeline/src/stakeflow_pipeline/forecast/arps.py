"""Arps hyperbolic decline: q(t) = qi / (1 + b·Di·t)^(1/b).

b = 0 is exponential decline (q = qi·e^(-Di·t)), b = 1 harmonic. We bound b to [0, 1.5]:
above 1 the curve flattens so much that long forecasts become unphysical, and NCS fields with
transient flow or pressure support rarely need more than 1.5 over a few years of data.

The fit works on log(rate), for two reasons:
- production noise is multiplicative (a turnaround cuts a month by a percentage, not by a fixed
  volume), so log residuals are roughly homoscedastic across big and small fields;
- the curve can never go negative.

`least_squares` with a soft-L1 loss keeps single bad months (turnarounds, partial shut-ins)
from dragging the curve down; they still show up in the residuals, which the forecast
bootstrap reuses as realistic noise.

t is in months since the start of the fit window; Di is nominal decline per month internally.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import least_squares

FloatArray = NDArray[np.float64]

B_MAX = 1.5
# 0.5 per month nominal is a 99.8% first-year decline: anything faster is not a decline curve
DI_MAX_PER_MONTH = 0.5
# Residuals beyond ~10% in log terms count linearly, not quadratically
ROBUST_SCALE = 0.1
# Below this b·Di·t the hyperbolic formula loses precision; use its exponential limit
_SMALL = 1e-7
# Below this b, b·Di·t < _SMALL for any realistic t, so the limit branch is always taken and
# dividing by b (which could underflow to 0 when squared) is never needed
_TINY_B = 1e-12


@dataclass(frozen=True)
class ArpsParams:
    qi: float
    """Rate at t = 0 (same unit as the fitted rates, Sm³ o.e. per day here)."""
    b: float
    di: float
    """Nominal initial decline, per month."""

    @property
    def di_per_year(self) -> float:
        return self.di * 12

    def first_year_decline(self) -> float:
        """Effective decline over the first 12 months, as a fraction: 1 - q(12)/q(0)."""
        return float(1 - np.exp(log_rate(np.array([12.0]), 0.0, self.b, self.di)[0]))


@dataclass(frozen=True)
class ArpsFit:
    params: ArpsParams
    log_residuals: FloatArray
    """log(actual) - log(fitted), one per fitted month."""
    rmse_log: float

    def as_vector(self) -> FloatArray:
        return np.array([np.log(self.params.qi), self.params.b, self.params.di])


def log_rate(t: FloatArray, log_qi: float, b: float, di: float) -> FloatArray:
    """log q(t). Uses log1p and the b → 0 limit so it is exact for exponential decline too."""
    x = b * di * t
    safe_b = b if b > _TINY_B else 1.0
    decline = np.where(x < _SMALL, di * t, np.log1p(x) / safe_b)
    return log_qi - decline


def rate(t: FloatArray, params: ArpsParams) -> FloatArray:
    return np.exp(log_rate(t, float(np.log(params.qi)), params.b, params.di))


def _jacobian(t: FloatArray, b: float, di: float) -> FloatArray:
    """Partial derivatives of log q(t) with respect to (log qi, b, Di)."""
    x = b * di * t
    safe_b = b if b > _TINY_B else 1.0
    d_b = np.where(x < _SMALL, (di * t) ** 2 / 2, (np.log1p(x) - x / (1 + x)) / safe_b**2)
    d_di = -t / (1 + x)
    return np.column_stack([np.ones_like(t), d_b, d_di])


def fit(t: FloatArray, rates: FloatArray, start: FloatArray | None = None) -> ArpsFit:
    """Fit Arps to positive rates. Tries three b starting points unless `start` is given.

    `start` (log qi, b, Di) is for bootstrap refits: the original fit is a good starting point
    and one local search is enough.
    """
    if t.shape != rates.shape or t.size < 3:
        raise ValueError("need at least 3 matching points")
    if np.any(rates <= 0):
        raise ValueError("rates must be positive; drop shut-in months before fitting")
    y = np.log(rates)

    def residuals(p: FloatArray) -> FloatArray:
        return log_rate(t, p[0], p[1], p[2]) - y

    def jacobian(p: FloatArray) -> FloatArray:
        return _jacobian(t, p[1], p[2])

    bounds = ([-np.inf, 0.0, 0.0], [np.inf, B_MAX, DI_MAX_PER_MONTH])
    if start is None:
        slope, intercept = np.polyfit(t, y, 1)
        di0 = float(np.clip(-slope, 1e-3, DI_MAX_PER_MONTH / 2))
        starts = [np.array([intercept, b0, di0]) for b0 in (0.05, 0.6, 1.3)]
    else:
        lower, upper = np.array(bounds[0]), np.array(bounds[1])
        # trf needs a strictly feasible start
        starts = [np.clip(start, lower + 1e-9, upper - 1e-9)]

    best = None
    for x0 in starts:
        result = least_squares(
            residuals, x0, jac=jacobian, bounds=bounds, loss="soft_l1", f_scale=ROBUST_SCALE
        )
        if best is None or result.cost < best.cost:
            best = result
    assert best is not None
    log_qi, b, di = (float(v) for v in best.x)
    resid = y - log_rate(t, log_qi, b, di)
    return ArpsFit(
        params=ArpsParams(qi=float(np.exp(log_qi)), b=b, di=di),
        log_residuals=resid,
        rmse_log=float(np.sqrt(np.mean(resid**2))),
    )
