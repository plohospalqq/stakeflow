"""Share prices for context and the what-if scenario explorer. Scenarios, never forecasts.

Every scenario response carries the model's fit, coefficients with standard errors, the
backtest, caveats and the notice "Scenario, not a forecast; not investment advice."
"""

import math
from dataclasses import asdict
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.scenario import (
    NOTICE,
    PRESETS,
    SIGNIFICANT_T,
    ScenarioParams,
    StoredModel,
    run_scenario,
)
from stakeflow_api.schemas import (
    Backtest,
    BacktestQuarter,
    ModelCard,
    ModelCoefficient,
    ScenarioBand,
    ScenarioBase,
    ScenarioContribution,
    ScenarioPathPoint,
    ScenarioPreset,
    ScenarioResponse,
    SharePricePoint,
    SharePriceSeries,
)

router = APIRouter(tags=["scenarios"])
Conn = Annotated[Connection, Depends(get_conn)]

DEFAULT_DAYS = 365
SHORT_SAMPLE_MONTHS = 36
MIN_SCORED_QUARTERS = 4

SHARE_PRICE_NOTE = (
    "Daily closing prices in NOK, adjusted for dividends and corporate actions. Imported into "
    "this installation from a CSV its operator downloaded for personal use; Stakeflow does not "
    "download or redistribute share prices (docs/market-data-sources.md)."
)
METHOD = (
    "Ordinary least squares on monthly log returns of the share against monthly log changes "
    "in Brent (EIA), TTF gas (World Bank), the company's production on the Norwegian shelf "
    "(Sodir, attributed by ownership share) and EUR/USD (ECB). Monthly averages throughout. "
    "A scenario applies the coefficients to the changes you pick; past drift (the intercept) "
    "is not projected. The 80% band adds coefficient uncertainty and the month-to-month "
    "movement the model cannot explain (normal approximation)."
)


def _listing(conn: Connection, company_id: str) -> dict:
    company = fetch_one(
        conn,
        "select group_id, display_name from marts.dim_company_group where group_id = %(id)s",
        {"id": company_id},
    )
    if company is None:
        raise HTTPException(404, f"company {company_id!r} not found")
    listing = fetch_one(
        conn,
        "select ticker, isin, exchange, currency from marts.share_listings where group_id = %(id)s",
        {"id": company_id},
    )
    if listing is None:
        raise HTTPException(404, f"company {company_id!r} has no listed share in Stakeflow")
    return {**company, **listing}


@router.get(
    "/companies/{company_id}/share-price",
    response_model=SharePriceSeries,
    response_model_by_alias=True,
)
def share_price(
    company_id: str,
    conn: Conn,
    start: Annotated[date | None, Query(description="First day (default: a year back)")] = None,
    end: Annotated[date | None, Query(description="Last day (default: newest)")] = None,
) -> SharePriceSeries:
    """Daily closes for context. Empty when no prices were imported into this installation."""
    if start and end and start > end:
        raise HTTPException(422, "start must not be after end")
    company = _listing(conn, company_id)
    newest = fetch_one(
        conn,
        "select max(date) as d from marts.fct_share_prices_daily where group_id = %(id)s",
        {"id": company_id},
    )
    last = end or (newest["d"] if newest and newest["d"] else date.today())
    first = start or last - timedelta(days=DEFAULT_DAYS)
    rows = fetch_all(
        conn,
        """
        select date, close_nok::float8 as close, volume
        from marts.fct_share_prices_daily
        where group_id = %(id)s and date between %(first)s and %(last)s
        order by date
        """,
        {"id": company_id, "first": first, "last": last},
    )
    return SharePriceSeries(
        company_id=company_id,
        company_name=company["display_name"],
        ticker=company["ticker"],
        isin=company["isin"],
        exchange=company["exchange"],
        currency=company["currency"],
        note=SHARE_PRICE_NOTE,
        points=[SharePricePoint(**r) for r in rows],
    )


@router.get("/scenarios/presets", response_model=list[ScenarioPreset], response_model_by_alias=True)
def scenario_presets() -> list[ScenarioPreset]:
    """Ready-made scenarios in plain language, as parameters for /companies/{id}/scenario."""
    return [
        ScenarioPreset(id=p.id, name=p.name, description=p.description, params=p.params)
        for p in PRESETS
    ]


@router.get(
    "/companies/{company_id}/scenario",
    response_model=ScenarioResponse,
    response_model_by_alias=True,
)
def company_scenario(
    company_id: str, conn: Conn, params: Annotated[ScenarioParams, Query()]
) -> ScenarioResponse:
    """How the share price *might* respond to the changes you pick, with an 80% band.

    A scenario, not a forecast; not investment advice. The query parameters are the shared
    scenario contract: brent_change_pct, ttf_change_pct, production_change_pct,
    eurusd_change_pct, horizon_months.
    """
    company = _listing(conn, company_id)
    row = fetch_one(
        conn,
        "select * from marts.fct_share_price_models where group_id = %(id)s",
        {"id": company_id},
    )
    if row is None or row["status"] != "ok":
        reason = row["status_note"] if row else "the model has not run yet"
        raise HTTPException(
            503,
            f"no scenario model for {company['display_name']}: {reason}. Import share "
            "prices (docs/market-data-sources.md) and run the market_refresh job.",
        )
    base = fetch_one(
        conn,
        "select date, close_nok::float8 as close from marts.fct_share_prices_daily"
        " where group_id = %(id)s order by date desc limit 1",
        {"id": company_id},
    )
    if base is None:
        raise HTTPException(503, f"no share prices imported for {company['display_name']}")

    model = StoredModel.from_row(row["coefficients"], row["covariance"], row["resid_std"])
    result = run_scenario(model, params)
    variance = result.sd_log**2
    close = base["close"]
    return ScenarioResponse(
        company_id=company_id,
        company_name=company["display_name"],
        ticker=company["ticker"],
        currency=company["currency"],
        scenario=params,
        base=ScenarioBase(date=base["date"], close=close),
        change_pct=result.change_pct,
        price=close * (1 + result.change_pct / 100),
        band_80=ScenarioBand(
            lo_change_pct=result.lo_change_pct,
            hi_change_pct=result.hi_change_pct,
            lo_price=close * (1 + result.lo_change_pct / 100),
            hi_price=close * (1 + result.hi_change_pct / 100),
        ),
        variance_from_coefficients=result.coefficient_sd_log**2 / variance if variance else 0.0,
        path=[ScenarioPathPoint(**asdict(p)) for p in result.path],
        contributions=[ScenarioContribution(**asdict(c)) for c in result.contributions],
        model=_model_card(conn, row),
        caveats=_model_caveats(row, company["display_name"]) + result.caveats,
        notice=NOTICE,
    )


def _model_card(conn: Connection, row: dict) -> ModelCard:
    quarters = fetch_all(
        conn,
        "select * from marts.fct_share_price_backtest"
        " where group_id = %(id)s order by quarter_start",
        {"id": row["group_id"]},
    )
    return ModelCard(
        version=row["model_version"],
        run_at=row["run_at"],
        method=METHOD,
        window_start=row["window_start"],
        window_end=row["window_end"],
        n_obs=row["n_obs"],
        r2=row["r2"],
        adj_r2=row["adj_r2"],
        residual_sd_monthly_pct=100 * row["resid_std"],
        coefficients=[
            ModelCoefficient(
                term=c["term"],
                estimate=c["estimate"],
                std_error=c["std_error"],
                t_stat=c["t_stat"],
                significant=abs(c["t_stat"]) >= SIGNIFICANT_T,
            )
            for c in row["coefficients"]
        ],
        excluded_months=row["excluded_months"],
        backtest=Backtest(
            quarters_scored=row["backtest_quarters"],
            r2_in_sample_quarterly=row["backtest_r2_in_sample"],
            r2_out_of_sample_quarterly=row["backtest_r2_out_of_sample"],
            band_coverage_80=row["backtest_band_coverage"],
            note=_backtest_note(row),
            quarters=[
                BacktestQuarter(
                    quarter_start=q["quarter_start"],
                    actual_pct=100 * math.expm1(q["actual_return"]),
                    fitted_pct=100 * math.expm1(q["fitted_return"]),
                    out_of_sample_pct=_pct(q["oos_return"]),
                    out_of_sample_lo_pct=_pct(q["oos_lo"]),
                    out_of_sample_hi_pct=_pct(q["oos_hi"]),
                    train_months=q["train_months"],
                )
                for q in quarters
            ],
        ),
    )


def _backtest_note(row: dict) -> str:
    basis = (
        "Each quarter is explained with what Brent, TTF, production and EUR/USD actually did, "
        "so this measures how much the drivers explain, not whether anyone could have "
        "predicted them."
    )
    scored = row["backtest_quarters"]
    if scored < MIN_SCORED_QUARTERS:
        return (
            f"Only {scored} quarter(s) could be scored out of sample (fit on earlier months "
            f"only); out-of-sample R² and band coverage need at least {MIN_SCORED_QUARTERS} "
            f"and are left out. {basis}"
        )
    oos = row["backtest_r2_out_of_sample"]
    verdict = (
        "no better than the average past return"
        if oos is None or oos <= 0
        else f"{oos:.0%} of the quarter-to-quarter variation"
    )
    return f"Out of sample, the drivers explained {verdict}. {basis}"


def _model_caveats(row: dict, company_name: str) -> list[str]:
    caveats = []
    if row["n_obs"] < SHORT_SAMPLE_MONTHS:
        caveats.append(
            f"Fitted on only {row['n_obs']} months ({row['window_start']:%b %Y} to "
            f"{row['window_end']:%b %Y}): the free share price export covers about two years. "
            "Treat the sensitivities as rough."
        )
    if "(NCS only)" in company_name:
        caveats.append(
            f"The share prices the whole company, while production here is {company_name}: "
            "international, trading and renewables are not in the model."
        )
    return caveats


def _pct(log_return: float | None) -> float | None:
    return None if log_return is None else 100 * math.expm1(log_return)
