"""Companies = company groups (Equinor, Aker BP, …), each made of one or more legal entities."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.caching import data_cache_headers
from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.ranges import MonthRange, month_range
from stakeflow_api.schemas import (
    CompanyDetail,
    CompanySummary,
    FieldMonthlyForCompany,
    LegalEntity,
    MonthlyPoint,
    QuarterReconciliation,
)
from stakeflow_api.summaries import (
    SUMMARY_COLUMNS,
    SUMMARY_JOINS,
    latest_summary_ctes,
    to_latest_summary,
)

router = APIRouter(
    prefix="/companies", tags=["companies"], dependencies=[Depends(data_cache_headers)]
)
Conn = Annotated[Connection, Depends(get_conn)]

COMPANY_SQL = f"""
with {latest_summary_ctes("group")}
select g.group_id as id, g.display_name as name, g.is_focus, g.scope_note,
       coalesce(pc.producing_field_count, 0) as producing_field_count,
       {SUMMARY_COLUMNS}
from marts.dim_company_group as g
left join marts.fct_group_production_monthly as pc
    on pc.group_id = g.group_id and pc.month = (select latest from m)
{SUMMARY_JOINS.format(key="g.group_id")}
"""


def _to_summary(row: dict) -> CompanySummary:
    return CompanySummary(
        id=row["id"],
        name=row["name"],
        is_focus=row["is_focus"],
        scope_note=row["scope_note"],
        producing_field_count=row["producing_field_count"],
        latest=to_latest_summary(row),
    )


@router.get("", response_model=list[CompanySummary], response_model_by_alias=True)
def list_companies(
    conn: Conn,
    focus: Annotated[bool, Query(description="Only the focus companies")] = False,
    q: Annotated[str | None, Query(max_length=80, description="Name contains")] = None,
    producing: Annotated[bool, Query(description="Only companies producing now")] = True,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> list[CompanySummary]:
    rows = fetch_all(
        conn,
        f"""
        select * from ({COMPANY_SQL}) as c
        where (not %(focus)s or c.is_focus)
          and (%(q)s::text is null or strpos(lower(c.name), lower(%(q)s)) > 0)
          and (not %(producing)s or c.latest_boe_per_day > 0)
        order by c.latest_boe_per_day desc nulls last, c.name
        limit %(limit)s
        """,
        {"focus": focus, "q": q, "producing": producing, "limit": limit},
    )
    return [_to_summary(r) for r in rows]


@router.get("/{company_id}", response_model=CompanyDetail, response_model_by_alias=True)
def get_company(company_id: str, conn: Conn) -> CompanyDetail:
    row = fetch_one(
        conn, f"select * from ({COMPANY_SQL}) as c where c.id = %(id)s", {"id": company_id}
    )
    if row is None:
        raise HTTPException(404, f"company {company_id!r} not found")
    entities = fetch_all(
        conn,
        """
        select company_id, name, nation_code, factpage_url
        from marts.dim_company
        where group_id = %(id)s
          and company_id in (select company_id from marts.fct_field_ownership)
        order by name
        """,
        {"id": company_id},
    )
    return CompanyDetail(
        **_to_summary(row).model_dump(),
        legal_entities=[LegalEntity(**e) for e in entities],
    )


@router.get(
    "/{company_id}/production", response_model=list[MonthlyPoint], response_model_by_alias=True
)
def company_production(
    company_id: str, conn: Conn, months: Annotated[MonthRange, Depends(month_range)]
) -> list[MonthlyPoint]:
    _ensure_company(conn, company_id)
    rows = fetch_all(
        conn,
        """
        select month,
               extract(day from (month + interval '1 month' - interval '1 day'))::int
                   as days_in_month,
               oil_sm3, gas_sm3, gas_oe_sm3, ngl_sm3, condensate_sm3, oe_sm3, boe_per_day
        from marts.fct_group_production_monthly
        where group_id = %(id)s and month between %(start)s and %(end)s
        order by month
        """,
        {"id": company_id, "start": months.start, "end": months.end},
    )
    return [MonthlyPoint(**r) for r in rows]


@router.get(
    "/{company_id}/fields",
    response_model=list[FieldMonthlyForCompany],
    response_model_by_alias=True,
)
def company_fields(
    company_id: str, conn: Conn, months: Annotated[MonthRange, Depends(month_range)]
) -> list[FieldMonthlyForCompany]:
    """Net-to-company production per field and month (for the stacked chart)."""
    _ensure_company(conn, company_id)
    rows = fetch_all(
        conn,
        """
        select cf.field_id, f.name as field_name, cf.month,
               sum(cf.effective_share_pct) as share_pct,
               sum(cf.oe_sm3) as oe_sm3, sum(cf.boe_per_day) as boe_per_day
        from marts.fct_company_field_production_monthly as cf
        join marts.dim_field as f using (field_id)
        where cf.group_id = %(id)s and cf.month between %(start)s and %(end)s
        group by cf.field_id, f.name, cf.month
        having sum(cf.oe_sm3) > 0
        order by cf.month, oe_sm3 desc
        """,
        {"id": company_id, "start": months.start, "end": months.end},
    )
    return [FieldMonthlyForCompany(**r) for r in rows]


@router.get(
    "/{company_id}/quarters",
    response_model=list[QuarterReconciliation],
    response_model_by_alias=True,
)
def company_quarters(
    company_id: str,
    conn: Conn,
    since: Annotated[date | None, Query(description="First quarter start")] = None,
) -> list[QuarterReconciliation]:
    """Quarterly Sodir-attributed production next to what the company reported."""
    _ensure_company(conn, company_id)
    rows = fetch_all(
        conn,
        """
        select quarter_start, months_in_data, is_complete, attributed_kboe_d, reported_kboe_d,
               error_pct, reported_on, source_url
        from marts.fct_quarterly_reconciliation
        where group_id = %(id)s and quarter_start >= coalesce(%(since)s, date '2020-01-01')
        order by quarter_start
        """,
        {"id": company_id, "since": since},
    )
    return [QuarterReconciliation(**r) for r in rows]


def _ensure_company(conn: Connection, company_id: str) -> None:
    found = fetch_one(
        conn, "select 1 from marts.dim_company_group where group_id = %(id)s", {"id": company_id}
    )
    if found is None:
        raise HTTPException(404, f"company {company_id!r} not found")
