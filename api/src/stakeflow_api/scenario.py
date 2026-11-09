"""What-if scenarios on top of the stored share-price model. A scenario, not a forecast.

The model (pipeline: stakeflow_pipeline/ml/scenario.py) explains monthly share log returns by
log changes in Brent, TTF, attributed production and EUR/USD. For the changes a user picks
over a horizon of h months:

    central log change  mu  = sum(b_i * ln(1 + change_i))          (no drift: intercept left out)
    variance            var = x' Cov(b) x  +  h * s^2                (coefficients + unexplained)
    80% band                = mu -/+ 1.2816 * sqrt(var), back to % with exp(.) - 1

Pure Python on purpose: a 4x4 quadratic form needs no numerical library.
"""

import math
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

NOTICE = "Scenario, not a forecast; not investment advice."
Z80 = 1.2815515655446004
DRIVERS = ("brent", "ttf", "production", "eurusd")
# ln(0) is undefined; a -100% production change is computed as -99% and flagged
MIN_LEVEL_RATIO = 0.01
# A requested move larger than this many typical moves over the horizon is an extrapolation
EXTRAPOLATION_SDS = 3.0
SIGNIFICANT_T = 2.0


class ScenarioParams(BaseModel):
    """The scenario contract shared with the free-text parser. Names are fixed (snake_case).

    Unknown names are rejected (422), so a typo never silently becomes "no change".
    """

    model_config = ConfigDict(extra="forbid")

    brent_change_pct: float = Field(0, ge=-90, le=300, description="Brent, % change")
    ttf_change_pct: float = Field(0, ge=-90, le=300, description="TTF gas, % change")
    production_change_pct: float = Field(
        0, ge=-100, le=100, description="Company's attributed production, % change"
    )
    eurusd_change_pct: float = Field(0, ge=-50, le=100, description="EUR/USD, % change")
    horizon_months: int = Field(3, ge=1, le=24, description="Months over which it happens")

    def changes(self) -> dict[str, float]:
        return {
            "brent": self.brent_change_pct,
            "ttf": self.ttf_change_pct,
            "production": self.production_change_pct,
            "eurusd": self.eurusd_change_pct,
        }


@dataclass(frozen=True)
class Preset:
    id: str
    name: str
    description: str
    params: ScenarioParams


PRESETS: tuple[Preset, ...] = (
    Preset(
        "calm-year",
        "Calm year: everything flat",
        "Oil, gas, production and the dollar stay where they are for a year. The central "
        "change is zero; the band shows how much the share has moved for reasons the model "
        "cannot explain.",
        ScenarioParams(horizon_months=12),
    ),
    Preset(
        "oil-crash",
        "Oil crash: Brent −30%",
        "Brent falls by almost a third within three months, as in late 2014 or spring 2020. "
        "Everything else stays put.",
        ScenarioParams(brent_change_pct=-30, horizon_months=3),
    ),
    Preset(
        "oil-rally",
        "Oil rally: Brent +30%",
        "Brent rises by almost a third within three months. Everything else stays put.",
        ScenarioParams(brent_change_pct=30, horizon_months=3),
    ),
    Preset(
        "gas-spike",
        "Gas spike: TTF +50%",
        "European gas prices jump by half within three months, as in the supply scares of "
        "2021 and 2022. Oil and production unchanged.",
        ScenarioParams(ttf_change_pct=50, horizon_months=3),
    ),
    Preset(
        "sverdrup-outage",
        "Johan Sverdrup outage: production −10% for a quarter",
        "The company produces 10% less over the next three months, roughly what a long stop "
        "on Johan Sverdrup, Norway's largest oil field, would cost its biggest partners. "
        "Prices unchanged.",
        ScenarioParams(production_change_pct=-10, horizon_months=3),
    ),
    Preset(
        "strong-dollar",
        "Strong dollar: EUR/USD −10%",
        "The US dollar strengthens by about a tenth against the euro over six months. Oil and "
        "gas are priced in dollars; the share trades in Norwegian kroner.",
        ScenarioParams(eurusd_change_pct=-10, horizon_months=6),
    ),
)


@dataclass(frozen=True)
class Coefficient:
    term: str
    estimate: float
    std_error: float
    t_stat: float
    monthly_change_sd: float | None


@dataclass(frozen=True)
class StoredModel:
    coefficients: dict[str, Coefficient]
    covariance: dict[str, dict[str, float]]
    resid_std: float

    @staticmethod
    def from_row(
        coefficients: list[dict[str, Any]], covariance: dict[str, Any], resid_std: float
    ) -> "StoredModel":
        terms: list[str] = covariance["terms"]
        matrix: list[list[float]] = covariance["matrix"]
        return StoredModel(
            coefficients={
                c["term"]: Coefficient(
                    c["term"],
                    c["estimate"],
                    c["std_error"],
                    c["t_stat"],
                    c.get("monthly_change_sd"),
                )
                for c in coefficients
            },
            covariance={
                a: dict(zip(terms, row, strict=True)) for a, row in zip(terms, matrix, strict=True)
            },
            resid_std=resid_std,
        )


@dataclass(frozen=True)
class PathPoint:
    month_offset: int
    change_pct: float
    lo_change_pct: float
    hi_change_pct: float


@dataclass(frozen=True)
class Contribution:
    driver: str
    input_change_pct: float
    coefficient: float
    contribution_pct: float


@dataclass(frozen=True)
class ScenarioResult:
    change_pct: float
    lo_change_pct: float
    hi_change_pct: float
    sd_log: float
    coefficient_sd_log: float
    residual_sd_log: float
    path: list[PathPoint]
    contributions: list[Contribution]
    caveats: list[str]


def _log_change(pct: float) -> float:
    return math.log(max(1 + pct / 100, MIN_LEVEL_RATIO))


def _pct(log_change: float) -> float:
    return 100 * (math.exp(log_change) - 1)


def _moments(model: StoredModel, x: dict[str, float], months: int) -> tuple[float, float, float]:
    """Central log change, coefficient variance and residual variance for log changes x."""
    mu = sum(model.coefficients[d].estimate * x[d] for d in DRIVERS)
    coef_var = sum(x[a] * model.covariance[a][b] * x[b] for a in DRIVERS for b in DRIVERS)
    return mu, max(coef_var, 0.0), months * model.resid_std**2


def run_scenario(model: StoredModel, params: ScenarioParams) -> ScenarioResult:
    h = params.horizon_months
    changes = params.changes()
    x = {d: _log_change(pct) for d, pct in changes.items()}

    path = []
    for k in range(1, h + 1):
        mu_k, coef_var, resid_var = _moments(model, {d: x[d] * k / h for d in DRIVERS}, k)
        sd_k = math.sqrt(coef_var + resid_var)
        path.append(PathPoint(k, _pct(mu_k), _pct(mu_k - Z80 * sd_k), _pct(mu_k + Z80 * sd_k)))

    mu, coef_var, resid_var = _moments(model, x, h)
    sd = math.sqrt(coef_var + resid_var)
    contributions = [
        Contribution(
            d,
            changes[d],
            model.coefficients[d].estimate,
            _pct(model.coefficients[d].estimate * x[d]),
        )
        for d in DRIVERS
    ]
    return ScenarioResult(
        change_pct=_pct(mu),
        lo_change_pct=_pct(mu - Z80 * sd),
        hi_change_pct=_pct(mu + Z80 * sd),
        sd_log=sd,
        coefficient_sd_log=math.sqrt(coef_var),
        residual_sd_log=math.sqrt(resid_var),
        path=path,
        contributions=contributions,
        caveats=_caveats(model, params, x),
    )


_DRIVER_LABELS = {
    "brent": "Brent",
    "ttf": "TTF gas",
    "production": "production",
    "eurusd": "EUR/USD",
}


def _caveats(model: StoredModel, params: ScenarioParams, x: dict[str, float]) -> list[str]:
    caveats = []
    if params.production_change_pct <= -100:
        caveats.append(
            "Production −100% is computed as −99%: the model works on percentage changes, "
            "which cannot describe a full stop."
        )
    for d in DRIVERS:
        coefficient = model.coefficients[d]
        if x[d] == 0:
            continue
        sd = coefficient.monthly_change_sd
        typical = sd * math.sqrt(params.horizon_months) if sd else None
        if typical and abs(x[d]) > EXTRAPOLATION_SDS * typical:
            move = f"{params.changes()[d]:+g}".replace("-", "−")
            caveats.append(
                f"A {move}% move in {_DRIVER_LABELS[d]} over "
                f"{params.horizon_months} month(s) is far outside the fitting window (typical "
                f"move ±{_pct(typical):.0f}%). The result is an extrapolation."
            )
        if abs(coefficient.t_stat) < SIGNIFICANT_T:
            caveats.append(
                f"The {_DRIVER_LABELS[d]} sensitivity is not statistically distinguishable "
                f"from zero (t = {coefficient.t_stat:.1f}), so its effect may be noise."
            )
    return caveats
