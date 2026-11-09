"""Response models. JSON is camelCase so the generated TypeScript types read naturally.

Volume convention (same as the marts): monthly volumes in Sm³ oil equivalent. gas is given both
as Sm³ of gas (`gasSm3`) and as Sm³ o.e. (`gasOeSm3`, = gas / 1000), so products stack.
"""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    # Attribute docstrings become field descriptions in the OpenAPI contract
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, use_attribute_docstrings=True
    )


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


# Ask: same shape as the frontend's AskAnswer (frontend/src/api/types.ts), plus a few extras


class AskRequest(ApiModel):
    question: str = Field(min_length=1, max_length=500)


class AskStep(ApiModel):
    label: str
    detail: str


class AskChartPoint(ApiModel):
    label: str
    value: float
    previous: float | None


class AskChartLegend(ApiModel):
    current: str
    previous: str | None


class AskAnswer(ApiModel):
    question: str
    steps: list[AskStep]
    answer: str
    sql: str = Field(description="The SQL that ran: the validated, normalised form")
    duration_ms: int = Field(description="Query execution time")
    columns: list[str]
    rows: list[list[str | int | float | None]]
    chart: list[AskChartPoint]
    chart_unit: str
    chart_legend: AskChartLegend
    follow_ups: list[str]
    matched: bool = Field(description="False when the data cannot answer the question")
    chart_type: Literal["bar", "line", "none"] = "none"
    truncated: bool = Field(False, description="The 500-row cap was reached")


class AskTable(ApiModel):
    name: str
    description: str


# --- Phase 2: forecasts, nowcasts, the prediction log ------------------------------------

ForecastStatus = Literal["arps", "plateau", "ramp_up", "too_short", "shut_down"]
PredictionKind = Literal["live", "backtest"]
PredictionStatus = Literal["open", "resolved"]
ReportKind = Literal["trading update", "quarterly report"]


class ForecastPoint(ApiModel):
    """One month, Sm³ o.e. p10 is the low case, p90 the high (80% range)."""

    month: date
    p10: float
    p50: float
    p90: float
    is_actual: bool = False


class FitWindow(ApiModel):
    start: date
    end: date


class ModelCard(ApiModel):
    method: str
    status: ForecastStatus
    b: float | None
    initial_decline_pct_per_year: float | None
    """Effective decline over the first year of the fitted curve, percent."""
    di_nominal_per_year: float | None
    qi_sm3_per_day: float | None
    fit_window: FitWindow | None
    fit_months: int
    seasonal_swing_pct: float
    backtest_error_pct: float | None
    """Mean absolute % error over the 12 held-out months."""
    backtest_bias_pct: float | None
    naive_error_pct: float | None
    """Same, for the last 3 months held flat."""
    backtest_coverage_pct: float | None
    """Share of held-out months inside the 80% range."""
    run_at: datetime
    version: str
    data_through: date


class ForecastEvent(ApiModel):
    month: date
    label: str


class FieldForecast(ApiModel):
    field_id: int
    points: list[ForecastPoint]
    model: ModelCard
    events: list[ForecastEvent]


class Nowcast(ApiModel):
    """Quarterly production forecast (kboe/d), frozen at quarter end, scored vs the company."""

    company_id: str
    company_name: str
    quarter_start: date
    value: float
    lo: float
    hi: float
    made_at: datetime
    data_through: date
    months_in_data: int
    model_version: str
    hash: str
    input_hash: str
    status: PredictionStatus
    expected_report_on: date
    report_kind: ReportKind


class PredictionRecord(ApiModel):
    """One row of the append-only prediction log (kboe/d), with what happened since."""

    id: str
    company_id: str
    company_name: str
    quarter_start: date
    kind: PredictionKind
    is_latest: bool
    made_at: datetime
    as_of: date
    data_through: date
    months_in_data: int
    predicted: float
    lo: float
    hi: float
    model_version: str
    status: PredictionStatus
    expected_report_on: date
    report_kind: ReportKind
    reported_on: date | None
    actual: float | None
    error_pct: float | None
    in_range: bool | None
    baseline: float | None
    """Naive guess: the company's reported figure for the quarter before."""
    baseline_error_pct: float | None
    attributed_actual: float | None
    """Sodir-attributed production for the quarter, once all three months are in."""
    attributed_error_pct: float | None
    attributed_in_range: bool | None
    attributed_baseline: float | None
    attributed_baseline_error_pct: float | None
    hash: str
    input_hash: str
    commit_url: str | None = None
