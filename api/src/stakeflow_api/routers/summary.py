"""Shelf-wide headline numbers for the landing page ("4.22 million barrels a day").

Everything a non-expert story needs in one call: totals, the state's share, last full year of gas,
the largest fields and a 24-month series. Totals are field sums, so they include every owner.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from stakeflow_api.caching import data_cache_headers
from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.schemas import ApiModel

router = APIRouter(tags=["summary"])
Conn = Annotated[Connection, Depends(get_conn)]


class SummaryField(ApiModel):
    id: int
    name: str
    boe_per_day: float
    year_ago_boe_per_day: float | None
    oil_share: float


class SummaryPoint(ApiModel):
    month: date
    boe_per_day: float


class ShelfSummary(ApiModel):
    month: date
    boe_per_day: float
    prev_month_boe_per_day: float | None
    year_ago_boe_per_day: float | None
    oil_share: float
    gas_share: float
    ngl_condensate_share: float
    producing_fields: int
    state_boe_per_day: float
    state_share: float
    gas_year: int
    gas_year_bn_sm3: float
    top_fields: list[SummaryField]
    series: list[SummaryPoint]


TOTALS_SQL = """
with m as (select latest_month as latest from marts.meta_data_freshness),
totals as (
    select p.month, sum(p.boe_per_day) as boe_per_day, sum(p.oe_sm3) as oe_sm3,
           sum(p.oil_sm3) as oil_sm3, sum(p.gas_oe_sm3) as gas_oe_sm3,
           sum(p.ngl_sm3 + p.condensate_sm3) as nglc_sm3,
           count(*) filter (where p.oe_sm3 > 0) as producing_fields
    from marts.fct_field_production_monthly as p, m
    where p.month in (m.latest, (m.latest - interval '1 month')::date,
                      (m.latest - interval '1 year')::date)
    group by p.month
)
select t.*, (t.month = m.latest) as is_latest,
       (t.month = (m.latest - interval '1 month')::date) as is_prev
from totals as t, m
"""


@router.get(
    "/summary",
    response_model=ShelfSummary,
    response_model_by_alias=True,
    dependencies=[Depends(data_cache_headers)],
)
def shelf_summary(conn: Conn) -> ShelfSummary:
    rows = fetch_all(conn, TOTALS_SQL)
    latest = next((r for r in rows if r["is_latest"]), None)
    if latest is None or not latest["oe_sm3"]:
        raise HTTPException(503, "no data loaded yet; run the pipeline")
    prev = next((r for r in rows if r["is_prev"]), None)
    year_ago = next((r for r in rows if not r["is_latest"] and not r["is_prev"]), None)
    oe = float(latest["oe_sm3"])
    month: date = latest["month"]

    state = fetch_one(
        conn,
        "select boe_per_day from marts.fct_group_production_monthly"
        " where group_id = 'petoro' and month = %(m)s",
        {"m": month},
    )
    state_boed = float(state["boe_per_day"]) if state else 0.0

    # Last complete calendar year of gas (the current year is still running)
    gas_year = month.year if month.month == 12 else month.year - 1
    gas = fetch_one(
        conn,
        "select coalesce(sum(gas_sm3), 0) / 1e9 as bn from marts.fct_field_production_monthly"
        " where month between make_date(%(y)s, 1, 1) and make_date(%(y)s, 12, 1)",
        {"y": gas_year},
    )

    top = fetch_all(
        conn,
        """
        select f.field_id as id, f.name, cur.boe_per_day, ago.boe_per_day as year_ago_boe_per_day,
               case when cur.oe_sm3 > 0 then cur.oil_sm3 / cur.oe_sm3 else 0 end as oil_share
        from marts.fct_field_production_monthly as cur
        join marts.dim_field as f using (field_id)
        left join marts.fct_field_production_monthly as ago
            on ago.field_id = cur.field_id
           and ago.month = (%(m)s::date - interval '1 year')::date
        where cur.month = %(m)s
        order by cur.boe_per_day desc
        limit 5
        """,
        {"m": month},
    )
    series = fetch_all(
        conn,
        """
        select month, sum(boe_per_day) as boe_per_day
        from marts.fct_field_production_monthly
        where month > (%(m)s::date - interval '24 months')::date and month <= %(m)s
        group by month
        order by month
        """,
        {"m": month},
    )
    total = float(latest["boe_per_day"])
    return ShelfSummary(
        month=month,
        boe_per_day=total,
        prev_month_boe_per_day=float(prev["boe_per_day"]) if prev else None,
        year_ago_boe_per_day=float(year_ago["boe_per_day"]) if year_ago else None,
        oil_share=float(latest["oil_sm3"]) / oe,
        gas_share=float(latest["gas_oe_sm3"]) / oe,
        ngl_condensate_share=float(latest["nglc_sm3"]) / oe,
        producing_fields=int(latest["producing_fields"]),
        state_boe_per_day=state_boed,
        state_share=state_boed / total if total else 0.0,
        gas_year=gas_year,
        gas_year_bn_sm3=float(gas["bn"]) if gas else 0.0,
        top_fields=[
            SummaryField(
                id=t["id"],
                name=t["name"],
                boe_per_day=float(t["boe_per_day"]),
                year_ago_boe_per_day=(
                    float(t["year_ago_boe_per_day"]) if t["year_ago_boe_per_day"] else None
                ),
                oil_share=float(t["oil_share"]),
            )
            for t in top
        ],
        series=[
            SummaryPoint(month=s["month"], boe_per_day=float(s["boe_per_day"])) for s in series
        ],
    )
