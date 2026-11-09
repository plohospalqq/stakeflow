"""Per-field forecast: find the current decline, fit Arps, simulate an 80% range, backtest.

Every field that produced recently gets a forecast, because the company nowcast needs all of
them, but only fields in an established decline get an Arps curve. The others are flagged and
held flat at their recent level (the same rule as the naive baseline), so nothing is
extrapolated from a ramp-up or a plateau:

    status      when                                                     forecast
    ---------   ------------------------------------------------------   -------------------
    arps        ≥ 12 months since the plateau ended                      Arps from plateau end
    plateau     still within 10% of its recent peak                      flat, recent level
    ramp_up     not yet declining and the last 6 months beat the 6       flat, recent level
                before by more than 10%
    too_short   under 12 months of production                            flat, recent level
    shut_down   nothing produced in the last 3 months                    zero

Three refinements, each kept because it beat the naive baseline or improved calibration in
backtests over 5 cut-offs (Aug 2024 - Aug 2026, ~95 fields each):

- Seasonal factors: one multiplicative factor per calendar month from the last 5 years (summer
  turnarounds, winter gas offtake). Fitted on the deseasonalised series, re-applied to the
  forecast. Volume-weighted error at 1-3 months fell from 13.2% to 12.1%.
- Level anchor: the Arps curve gives the *shape*, the median of the last 6 months the *level*
  (see `_anchor`).
- Level drift: a random walk on top of the bootstrap, sized from the field's own history
  (see `_drift_sigma`). Raised real-data coverage of the 80% range from ~60% to ~70%.

Uncertainty: residual block bootstrap with refit (see `_bootstrap_arps`).

Quantiles use the statistical convention: p10 is the low case, p90 the high case (the reverse
of the reserves convention, where P90 is the conservative number).
"""

from dataclasses import dataclass, replace
from datetime import date
from enum import StrEnum

import numpy as np

from stakeflow_pipeline.forecast import arps
from stakeflow_pipeline.forecast.arps import ArpsParams, FloatArray
from stakeflow_pipeline.forecast.periods import add_months, days_in_month

# Bump on any change that can move a number: predictions record the version they came from
MODEL_VERSION = "arps-1.0.0"

HORIZON_MONTHS = 36
DRAWS = 200
BLOCK_MONTHS = 6
INTERVAL = (10.0, 50.0, 90.0)
SEED = 20261109

# Decline detection
MIN_HISTORY_MONTHS = 12
MIN_DECLINE_MONTHS = 12
MIN_POSITIVE_IN_WINDOW = 9
SHUT_IN_MONTHS = 3
LOOKBACK_MONTHS = 120  # 60 and 36 were tried: both worse in backtests
SMOOTHING_MONTHS = 5
PLATEAU_FRACTION = 0.9
RAMP_UP_GROWTH = 1.1

# Forecast refinements (see the module docstring)
ANCHOR_MONTHS = 6
SEASONAL_YEARS = 5
DRIFT_MONTHS = 60
DRIFT_DEFAULT = 0.02  # per month, when the history is too short to measure
DRIFT_MAX = 0.08  # per month: caps ramp-ups, whose history is all "drift"

# Backtest and its baseline
NAIVE_MONTHS = 3
BACKTEST_MONTHS = 12


class Status(StrEnum):
    ARPS = "arps"
    PLATEAU = "plateau"
    RAMP_UP = "ramp_up"
    TOO_SHORT = "too_short"
    SHUT_DOWN = "shut_down"


METHOD = {
    Status.ARPS: "Arps hyperbolic decline",
    Status.PLATEAU: "Flat at the last 3 months (on plateau, no decline to fit yet)",
    Status.RAMP_UP: "Flat at the last 3 months (still ramping up)",
    Status.TOO_SHORT: "Flat at the last 3 months (under 12 months of history)",
    Status.SHUT_DOWN: "No forecast (nothing produced in the last 3 months)",
}


@dataclass(frozen=True)
class FieldSeries:
    """Monthly net o.e. volumes of one field, gap-free from first production to `months[-1]`."""

    field_id: int
    months: list[date]
    oe_sm3: FloatArray

    def __post_init__(self) -> None:
        if len(self.months) != self.oe_sm3.size:
            raise ValueError("months and volumes differ in length")

    @property
    def days(self) -> FloatArray:
        return np.array([days_in_month(m) for m in self.months], dtype=float)

    @property
    def rates(self) -> FloatArray:
        """Sm³ o.e. per day. Negative net volumes (fuel gas use in a shut-in) count as zero."""
        return np.clip(self.oe_sm3, 0, None) / self.days

    def through(self, last_month: date) -> "FieldSeries":
        """The series as it looked when `last_month` was the newest month."""
        keep = [i for i, m in enumerate(self.months) if m <= last_month]
        return replace(self, months=[self.months[i] for i in keep], oe_sm3=self.oe_sm3[keep])


@dataclass(frozen=True)
class FieldForecast:
    field_id: int
    status: Status
    months: list[date]
    draws: FloatArray
    """Simulated monthly volumes, Sm³ o.e., shape (DRAWS, months)."""
    params: ArpsParams | None = None
    fit_start: date | None = None
    fit_end: date | None = None
    fit_months: int = 0
    rmse_log: float | None = None
    seasonal_swing_pct: float = 0.0
    """Best calendar month over worst, in percent (0 = no seasonal pattern used)."""

    @property
    def method(self) -> str:
        return METHOD[self.status]

    def quantiles(self) -> tuple[FloatArray, FloatArray, FloatArray]:
        p10, p50, p90 = np.percentile(self.draws, INTERVAL, axis=0)
        return p10, p50, p90


@dataclass(frozen=True)
class FieldBacktest:
    """12 held-out months: the model fitted without them versus what happened."""

    field_id: int
    status: Status
    actual: FloatArray
    p10: FloatArray
    p50: FloatArray
    p90: FloatArray
    naive: FloatArray

    @property
    def _scored(self) -> FloatArray:
        return self.actual > 0

    def mape_pct(self) -> float:
        return _mape(self.p50, self.actual)

    def bias_pct(self) -> float:
        return _bias(self.p50, self.actual)

    def naive_mape_pct(self) -> float:
        return _mape(self.naive, self.actual)

    def naive_bias_pct(self) -> float:
        return _bias(self.naive, self.actual)

    def coverage_pct(self) -> float:
        a = self.actual[self._scored]
        inside = (a >= self.p10[self._scored]) & (a <= self.p90[self._scored])
        return float(100 * inside.mean())

    @property
    def scored_months(self) -> int:
        return int(self._scored.sum())


def _mape(forecast: FloatArray, actual: FloatArray) -> float:
    ok = actual > 0
    return float(100 * np.mean(np.abs(forecast[ok] - actual[ok]) / actual[ok]))


def _bias(forecast: FloatArray, actual: FloatArray) -> float:
    ok = actual > 0
    return float(100 * np.mean((forecast[ok] - actual[ok]) / actual[ok]))


def seasonal_profile(months: list[date], rates: FloatArray) -> FloatArray:
    """Log-scale factor per calendar month (index 0 = January), zero on average."""
    keep = slice(max(0, rates.size - SEASONAL_YEARS * 12), None)
    cal = np.array([m.month - 1 for m in months])[keep]
    r = rates[keep]
    ok = r > 0
    if ok.sum() < 24:
        return np.zeros(12)
    logs = np.log(r[ok])
    dev = logs - rolling_median(logs, 13)
    cal = cal[ok]
    profile = np.zeros(12)
    for k in range(12):
        hits = dev[cal == k]
        if hits.size >= 2:
            profile[k] = np.median(hits)
    return profile - profile.mean()


def rolling_median(values: FloatArray, window: int) -> FloatArray:
    """Centred rolling median; shorter windows at the edges. Single outage months vanish."""
    half = window // 2
    return np.array(
        [np.median(values[max(0, i - half) : i + half + 1]) for i in range(values.size)]
    )


def classify(rates: FloatArray) -> tuple[Status, int | None]:
    """Status of the field at the end of `rates`, and where its current decline starts.

    The decline starts where the plateau ends: the last month whose smoothed rate is still
    within 10% of the highest smoothed rate of the last 10 years. Looking back 10 years, not
    over the whole life, means a redevelopment (Sverdrup phase 2, Ekofisk's later stages)
    resets the decline instead of being fitted as noise on a 1980s curve.
    """
    n = rates.size
    if n == 0 or np.all(rates[-SHUT_IN_MONTHS:] <= 0):
        return Status.SHUT_DOWN, None
    producing = np.flatnonzero(rates > 0)
    first = int(producing[0])
    if n - first < MIN_HISTORY_MONTHS:
        return Status.TOO_SHORT, None

    smooth = rolling_median(rates[first:], SMOOTHING_MONTHS)
    lookback = max(0, smooth.size - LOOKBACK_MONTHS)
    peak = lookback + int(np.argmax(smooth[lookback:]))
    near_peak = np.flatnonzero(smooth[peak:] >= PLATEAU_FRACTION * smooth[peak])
    start = first + peak + int(near_peak[-1])
    window = rates[start:]
    if window.size >= MIN_DECLINE_MONTHS and (window > 0).sum() >= MIN_POSITIVE_IN_WINDOW:
        return Status.ARPS, start

    recent = rates[-6:].mean()
    before = rates[-12:-6].mean()
    if before > 0 and recent > RAMP_UP_GROWTH * before:
        return Status.RAMP_UP, None
    return Status.PLATEAU, None


def forecast(
    series: FieldSeries,
    horizon: int = HORIZON_MONTHS,
    draws: int = DRAWS,
    rng: np.random.Generator | None = None,
) -> FieldForecast:
    """Forecast the `horizon` months after the end of `series`."""
    if not series.months:
        raise ValueError(f"field {series.field_id}: empty series")
    rng = rng if rng is not None else default_rng(series)
    months = [add_months(series.months[-1], k) for k in range(1, horizon + 1)]
    future_days = np.array([days_in_month(m) for m in months], dtype=float)
    season = seasonal_profile(series.months, series.rates)
    rates = series.rates * np.exp(-season[[m.month - 1 for m in series.months]])
    future_season = np.exp(season[[m.month - 1 for m in months]])
    swing = float(100 * (np.exp(season.max() - season.min()) - 1))
    status, start = classify(rates)

    if status is Status.SHUT_DOWN:
        return FieldForecast(series.field_id, status, months, np.zeros((draws, horizon)))

    if status is not Status.ARPS or start is None:
        level = rates[-NAIVE_MONTHS:].mean()
        noise = _log_noise_around_level(rates[-MIN_HISTORY_MONTHS:])
        recent = rates[-DRIFT_MONTHS:]
        drift = _random_walk(_drift_sigma(np.log(recent[recent > 0])), horizon, draws, rng)
        sim = level * np.exp(_block_resample(noise, horizon, draws, rng) + drift)
        return FieldForecast(
            series.field_id,
            status,
            months,
            sim * future_season * future_days,
            seasonal_swing_pct=swing,
        )

    t_all = np.arange(rates.size - start, dtype=float)
    window = rates[start:]
    positive = window > 0
    t_fit, r_fit = t_all[positive], window[positive]
    fitted = arps.fit(t_fit, r_fit)
    t_future = rates.size - start + np.arange(horizon, dtype=float)
    sim_rates = _bootstrap_arps(t_fit, fitted, t_future, draws, rng)
    return FieldForecast(
        series.field_id,
        status,
        months,
        sim_rates * future_season * future_days,
        params=fitted.params,
        fit_start=series.months[start],
        fit_end=series.months[-1],
        fit_months=int(positive.sum()),
        rmse_log=fitted.rmse_log,
        seasonal_swing_pct=swing,
    )


def _bootstrap_arps(
    t_fit: FloatArray,
    fitted: arps.ArpsFit,
    t_future: FloatArray,
    draws: int,
    rng: np.random.Generator,
) -> FloatArray:
    """Simulated future rates, shape (draws, horizon): residual block bootstrap with refit.

    Why this and not the parameter covariance from the Jacobian:
    - b and Di trade off strongly and the fit often sits on a bound (b = 0 or 1.5). A Gaussian
      around the optimum then proposes negative b or absurd paths; refitting on resampled data
      respects the bounds and the curve's non-linearity by construction.
    - Monthly residuals are autocorrelated (a turnaround season, a multi-month well problem).
      Resampling 6-month blocks keeps that, so the range is not falsely narrow, and the same
      blocks are replayed as future noise, so a draw can contain a realistic bad month.
    - It is cheap at NCS scale: ~100 fields x 200 refits, each warm-started, takes seconds.

    Each draw applies the whole estimator (fit + anchor) to a resampled history whose truth is
    the fitted curve, and adds that estimator's error to the real point forecast. On synthetic
    fields that follow the model, the 80% range then covers ~79% of held-out months.

    What it cannot know: new wells, tie-backs or a field restart. The level drift covers part of
    that; the rest shows up as backtest misses, which is why every model card carries its
    backtest error and coverage next to the range.
    """
    theta = fitted.as_vector()
    base = arps.log_rate(t_fit, *theta)
    curve = arps.log_rate(t_future, *theta)
    resid = fitted.log_residuals - np.median(fitted.log_residuals)
    point = curve + _anchor(fitted.log_residuals)

    fit_noise = _block_resample(resid, t_fit.size, draws, rng)
    future_noise = _block_resample(resid, t_future.size, draws, rng)
    drift = _random_walk(_drift_sigma(resid[-DRIFT_MONTHS:]), t_future.size, draws, rng)
    sim = np.empty((draws, t_future.size))
    for j in range(draws):
        sample = base + fit_noise[j]
        refit = arps.fit(t_fit, np.exp(sample), start=theta).as_vector()
        estimate = arps.log_rate(t_future, *refit) + _anchor(sample - arps.log_rate(t_fit, *refit))
        sim[j] = point + (estimate - curve) + future_noise[j]
    return np.exp(sim + drift)


def _drift_sigma(log_values: FloatArray) -> float:
    """Monthly step of a random-walk level drift, from the series' own 12-month level changes.

    The bootstrap explains month-to-month noise; this adds what it misses, the level slowly
    walking away from any curve (water breakthrough, a new well, a compressor upgrade). Using
    the field's own history keeps steady fields tight and erratic ones wide.
    """
    smooth = rolling_median(log_values, 3)
    lag = min(12, smooth.size // 2)
    if lag < 3:
        return DRIFT_DEFAULT
    changes = smooth[lag:] - smooth[:-lag]
    return float(min(np.sqrt(np.mean(changes**2) / lag), DRIFT_MAX))


def _random_walk(sigma: float, size: int, draws: int, rng: np.random.Generator) -> FloatArray:
    return rng.normal(0.0, sigma, size=(draws, size)).cumsum(axis=1)


def _anchor(log_residuals: FloatArray) -> float:
    """Level shift that puts the curve through the median of the last few months.

    The decline *shape* comes from years of history, the *level* from now: infill wells or a
    new tie-back lift a field above its old curve, and a forecast that starts off the latest
    level is wrong from month one.
    """
    return float(np.median(log_residuals[-ANCHOR_MONTHS:]))


def _log_noise_around_level(rates: FloatArray) -> FloatArray:
    """Log deviations from the median: a single outage month must not shift the centre."""
    positive = rates[rates > 0]
    if positive.size < 2:
        return np.zeros(1)
    logs = np.log(positive)
    return logs - np.median(logs)


def _block_resample(
    resid: FloatArray, size: int, draws: int, rng: np.random.Generator
) -> FloatArray:
    """Moving-block bootstrap: `draws` series of `size`, stitched from blocks of `resid`."""
    block = min(BLOCK_MONTHS, resid.size)
    blocks = -(-size // block)
    starts = rng.integers(0, resid.size - block + 1, size=(draws, blocks))
    idx = (starts[:, :, None] + np.arange(block)).reshape(draws, -1)[:, :size]
    return resid[idx]


def default_rng(series: FieldSeries) -> np.random.Generator:
    """Seeded per field and data cut-off, so the same inputs always give the same forecast."""
    return np.random.default_rng([SEED, series.field_id, series.months[-1].toordinal()])


def backtest(series: FieldSeries, holdout: int = BACKTEST_MONTHS) -> FieldBacktest | None:
    """Refit without the last `holdout` months and compare with what happened."""
    if len(series.months) < holdout + MIN_HISTORY_MONTHS:
        return None
    train = series.through(series.months[-holdout - 1])
    actual = series.oe_sm3[-holdout:].clip(0)
    if not np.any(actual > 0):
        return None
    result = forecast(train, horizon=holdout)
    p10, p50, p90 = result.quantiles()
    days = series.days[-holdout:]
    naive = np.full(holdout, train.rates[-NAIVE_MONTHS:].mean()) * days
    return FieldBacktest(series.field_id, result.status, actual, p10, p50, p90, naive)
