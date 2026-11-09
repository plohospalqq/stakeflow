"""Response models. JSON is camelCase so the generated TypeScript types read naturally.

Volume convention (same as the marts): monthly volumes in Sm³ oil equivalent. gas is given both
as Sm³ of gas (`gasSm3`) and as Sm³ o.e. (`gasOeSm3`, = gas / 1000), so products stack.
"""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from stakeflow_api.scenario import ScenarioParams


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProductVolumes(ApiModel):
    oil_sm3: float
    gas_sm3: float
    gas_oe_sm3: float
    ngl_sm3: float
    condensate_sm3: float
    oe_sm3: float
    boe_per_day: float


class MonthlyPoint(ProductVolumes):
    month: date
    days_in_month: int


class LatestSummary(ApiModel):
    month: date
    boe_per_day: float
    oe_sm3: float
    prev_month_boe_per_day: float | None
    year_ago_boe_per_day: float | None
    oil_share: float
    gas_share: float
    ngl_condensate_share: float


class CompanySummary(ApiModel):
    id: str
    name: str
    is_focus: bool
    scope_note: str | None
    producing_field_count: int
    latest: LatestSummary | None


class LegalEntity(ApiModel):
    company_id: int
    name: str
    nation_code: str | None
    factpage_url: str | None


class CompanyDetail(CompanySummary):
    legal_entities: list[LegalEntity]


class FieldMonthlyForCompany(ApiModel):
    field_id: int
    field_name: str
    month: date
    share_pct: float
    oe_sm3: float
    boe_per_day: float


class QuarterReconciliation(ApiModel):
    quarter_start: date
    months_in_data: int
    is_complete: bool
    attributed_kboe_d: float
    reported_kboe_d: float | None
    error_pct: float | None
    reported_on: date | None
    source_url: str | None


class OperatorRef(ApiModel):
    id: str
    name: str


class FieldSummary(ApiModel):
    id: int
    name: str
    status: str
    hc_type: str | None
    main_area: str | None
    operator: OperatorRef | None
    lon: float | None
    lat: float | None
    latest: LatestSummary | None


class Owner(ApiModel):
    company_id: int
    company_name: str
    group_id: str
    group_name: str
    share_pct: float


class FieldDetail(FieldSummary):
    discovery_year: int | None
    area_km2: float | None
    first_production_month: date | None
    last_production_month: date | None
    factpage_url: str | None
    current_owners: list[Owner]


class OwnershipPeriod(ApiModel):
    company_id: int
    company_name: str
    group_id: str
    group_name: str
    valid_from: date
    valid_to: date | None  # null = still valid
    share_pct: float


class PublicationLag(ApiModel):
    month: date
    lag_days_min: int | None
    lag_days_max: int
    is_measured: bool


class Freshness(ApiModel):
    latest_month: date
    last_refresh_at: datetime | None
    source: Literal["Sodir"] = "Sodir"
    licence: str = "Norwegian Licence for Open Government Data (NLOD)"
    recent_publication_lags: list[PublicationLag]


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]


# --- Prices (docs/market-data-sources.md) -----------------------------------------------------

PriceSeriesId = Literal["brent", "ttf", "eurusd", "usdnok"]


class PricePoint(ApiModel):
    date: date
    value: float


class PriceSeries(ApiModel):
    """Maps onto the frontend's PriceSeries; monthly series are dated the 1st of the month."""

    id: PriceSeriesId
    name: str
    unit: str
    frequency: Literal["daily", "monthly"]
    source: str
    source_url: str
    licence: str
    attribution: str
    points: list[PricePoint]


class LatestPrices(ApiModel):
    """Newest spot values, in the field names of the frontend's ForwardPrices.

    These are spot (last observation), not forward prices: no free source with display rights
    publishes Brent or TTF forwards.
    """

    kind: Literal["spot"] = "spot"
    as_of: date
    brent_usd_per_bbl: float | None
    brent_date: date | None
    ttf_eur_per_mwh: float | None
    ttf_month: date | None
    eur_usd: float | None
    eur_usd_date: date | None
    usd_nok: float | None
    usd_nok_date: date | None


# --- Share prices and the scenario explorer ---------------------------------------------------


class SharePricePoint(ApiModel):
    date: date
    close: float
    volume: int | None


class SharePriceSeries(ApiModel):
    company_id: str
    company_name: str
    ticker: str
    isin: str
    exchange: str
    currency: str
    note: str
    points: list[SharePricePoint]


class ScenarioPreset(ApiModel):
    id: str
    name: str
    description: str
    params: ScenarioParams  # contract names (snake_case), same as the query string


class ModelCoefficient(ApiModel):
    term: str
    estimate: float
    std_error: float
    t_stat: float
    significant: bool  # |t| >= 2


class BacktestQuarter(ApiModel):
    """Quarterly share return, actual vs explained by the drivers (in %)."""

    quarter_start: date
    actual_pct: float
    fitted_pct: float
    out_of_sample_pct: float | None
    out_of_sample_lo_pct: float | None
    out_of_sample_hi_pct: float | None
    train_months: int | None


class Backtest(ApiModel):
    quarters_scored: int
    r2_in_sample_quarterly: float | None
    r2_out_of_sample_quarterly: float | None
    band_coverage_80: float | None
    note: str
    quarters: list[BacktestQuarter]


class ModelCard(ApiModel):
    version: str
    run_at: datetime
    method: str
    window_start: date
    window_end: date
    n_obs: int
    r2: float
    adj_r2: float
    residual_sd_monthly_pct: float
    coefficients: list[ModelCoefficient]
    excluded_months: dict[str, str]
    backtest: Backtest


class ScenarioBase(ApiModel):
    date: date
    close: float


class ScenarioBand(ApiModel):
    lo_change_pct: float
    hi_change_pct: float
    lo_price: float
    hi_price: float


class ScenarioPathPoint(ApiModel):
    month_offset: int
    change_pct: float
    lo_change_pct: float
    hi_change_pct: float


class ScenarioContribution(ApiModel):
    driver: Literal["brent", "ttf", "production", "eurusd"]
    input_change_pct: float
    coefficient: float
    contribution_pct: float


class ScenarioResponse(ApiModel):
    company_id: str
    company_name: str
    ticker: str
    currency: str
    scenario: ScenarioParams  # echoed with the contract's snake_case names
    base: ScenarioBase
    change_pct: float
    price: float
    band_80: ScenarioBand
    # Share of the band's variance that comes from coefficient uncertainty (the rest is what
    # the model cannot explain)
    variance_from_coefficients: float
    path: list[ScenarioPathPoint]
    contributions: list[ScenarioContribution]
    model: ModelCard
    caveats: list[str]
    notice: str


# --- Anomalies ---------------------------------------------------------------------------------


class AnomalyPoint(ApiModel):
    """One month of the mini chart, kboe/d."""

    month: date
    actual: float
    expected: float
    lo: float
    hi: float


class AnomalyHit(ApiModel):
    """Effect on one current owner, kboe/d (negative = lost), at today's share."""

    company_id: str
    company_name: str
    is_focus: bool
    share_pct: float
    kboed: float


class Anomaly(ApiModel):
    """Maps onto the frontend's Anomaly (pctVsExpected in percent, volumes in kboe/d)."""

    id: str
    field_id: int
    field_name: str
    operator_name: str | None
    month: date
    pct_vs_expected: float
    severity: Literal["high", "medium", "low"]
    # Triage status is not stored yet; every anomaly is new until the UI can change it
    status: Literal["new"] = "new"
    note: str
    expected: float
    actual: float
    series: list[AnomalyPoint]
    hits: list[AnomalyHit]


class AnomalyRun(ApiModel):
    run_at: datetime
    model_version: str
    latest_month: date
    flagged_from: date
    fields_evaluated: int
    anomaly_count: int
    method: str
    params: dict[str, float | int]
