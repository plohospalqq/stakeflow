"""Fields: list, detail, production history, ownership history (SCD2) and map geometry."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.caching import data_cache_headers
from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.ranges import MonthRange, month_range
from stakeflow_api.schemas import (
    FeatureCollection,
    FieldDetail,
    FieldSummary,
    MonthlyPoint,
    OperatorRef,
    Owner,
    OwnershipPeriod,
)
from stakeflow_api.summaries import (
    SUMMARY_COLUMNS,
    SUMMARY_JOINS,
    latest_summary_ctes,
    to_latest_summary,
)

router = APIRouter(prefix="/fields", tags=["fields"], dependencies=[Depends(data_cache_headers)])
Conn = Annotated[Connection, Depends(get_conn)]
Status = Literal["Producing", "Shut down", "Approved for production"]

FIELD_SQL = f"""
with {latest_summary_ctes("field")}
select f.field_id as id, f.name, f.status, f.hc_type, f.main_area,
       f.operator_group_id, og.display_name as operator_name,
       st_x(f.centroid) as lon, st_y(f.centroid) as lat,
       f.discovery_year, f.area_km2, f.first_production_month, f.last_production_month,
       f.factpage_url,
       {SUMMARY_COLUMNS}
from marts.dim_field as f
left join marts.dim_company_group as og on og.group_id = f.operator_group_id
{SUMMARY_JOINS.format(key="f.field_id")}
"""


def _to_summary(row: dict) -> FieldSummary:
    operator = (
        OperatorRef(id=row["operator_group_id"], name=row["operator_name"])
        if row["operator_group_id"]
        else None
    )
    return FieldSummary(
        id=row["id"],
        name=row["name"],
        status=row["status"],
        hc_type=row["hc_type"],
        main_area=row["main_area"],
        operator=operator,
        lon=row["lon"],
        lat=row["lat"],
        latest=to_latest_summary(row),
    )


@router.get("", response_model=list[FieldSummary], response_model_by_alias=True)
def list_fields(
    conn: Conn,
    status: Annotated[Status | None, Query()] = None,
    owner: Annotated[str | None, Query(description="Company id currently holding a share")] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[FieldSummary]:
    rows = fetch_all(
        conn,
        f"""
        select * from ({FIELD_SQL}) as f
        where (%(status)s::text is null or f.status = %(status)s)
          and (%(q)s::text is null or strpos(lower(f.name), lower(%(q)s)) > 0)
          and (%(owner)s::text is null or f.id in (
                select field_id from marts.fct_field_ownership
                where is_current and group_id = %(owner)s))
        order by f.latest_boe_per_day desc nulls last, f.name
        limit %(limit)s
        """,
        {"status": status, "q": q, "owner": owner, "limit": limit},
    )
    return [_to_summary(r) for r in rows]


# Declared before /{field_id} so "geojson" is not parsed as an id
@router.get("/geojson", response_model=FeatureCollection)
def fields_geojson(
    conn: Conn,
    tolerance: Annotated[float, Query(ge=0, le=0.05, description="Simplify, degrees")] = 0.002,
) -> FeatureCollection:
    """Field outlines for the map, simplified to keep the payload small."""
    rows = fetch_all(
        conn,
        f"""
        select json_build_object(
            'type', 'Feature',
            'id', f.id,
            'geometry', st_asgeojson(st_simplifypreservetopology(d.geom, %(tol)s), 5)::json,
            'properties', json_build_object(
                'id', f.id, 'name', f.name, 'status', f.status,
                'operatorId', f.operator_group_id,
                'boePerDay', coalesce(f.latest_boe_per_day, 0),
                'oilShare', case when f.latest_oe_sm3 > 0
                                 then f.latest_oil_sm3 / f.latest_oe_sm3 end
            )
        ) as feature
        from ({FIELD_SQL}) as f
        join marts.dim_field as d on d.field_id = f.id
        where d.geom is not null
        """,
        {"tol": tolerance},
    )
    return FeatureCollection(features=[r["feature"] for r in rows])


@router.get("/{field_id}", response_model=FieldDetail, response_model_by_alias=True)
def get_field(field_id: int, conn: Conn) -> FieldDetail:
    row = fetch_one(conn, f"select * from ({FIELD_SQL}) as f where f.id = %(id)s", {"id": field_id})
    if row is None:
        raise HTTPException(404, f"field {field_id} not found")
    owners = fetch_all(
        conn,
        """
        select o.company_id, c.name as company_name, o.group_id, g.display_name as group_name,
               o.share_pct
        from marts.fct_field_ownership as o
        join marts.dim_company as c using (company_id)
        join marts.dim_company_group as g on g.group_id = o.group_id
        where o.field_id = %(id)s and o.is_current
        order by o.share_pct desc
        """,
        {"id": field_id},
    )
    return FieldDetail(
        **_to_summary(row).model_dump(),
        discovery_year=row["discovery_year"],
        area_km2=row["area_km2"],
        first_production_month=row["first_production_month"],
        last_production_month=row["last_production_month"],
        factpage_url=row["factpage_url"],
        current_owners=[Owner(**o) for o in owners],
    )


@router.get(
    "/{field_id}/production", response_model=list[MonthlyPoint], response_model_by_alias=True
)
def field_production(
    field_id: int, conn: Conn, months: Annotated[MonthRange, Depends(month_range)]
) -> list[MonthlyPoint]:
    _ensure_field(conn, field_id)
    rows = fetch_all(
        conn,
        """
        select month, days_in_month, oil_sm3, gas_sm3, gas_oe_sm3, ngl_sm3, condensate_sm3,
               oe_sm3, boe_per_day
        from marts.fct_field_production_monthly
        where field_id = %(id)s and month between %(start)s and %(end)s
        order by month
        """,
        {"id": field_id, "start": months.start, "end": months.end},
    )
    return [MonthlyPoint(**r) for r in rows]


@router.get(
    "/{field_id}/ownership", response_model=list[OwnershipPeriod], response_model_by_alias=True
)
def field_ownership(field_id: int, conn: Conn) -> list[OwnershipPeriod]:
    """Every ownership period (SCD Type 2). validTo is exclusive; null means still valid."""
    _ensure_field(conn, field_id)
    rows = fetch_all(
        conn,
        """
        select o.company_id, c.name as company_name, o.group_id, g.display_name as group_name,
               o.valid_from,
               case when o.is_current then null else o.valid_to end as valid_to,
               o.share_pct
        from marts.fct_field_ownership as o
        join marts.dim_company as c using (company_id)
        join marts.dim_company_group as g on g.group_id = o.group_id
        where o.field_id = %(id)s
        order by o.valid_from, o.share_pct desc
        """,
        {"id": field_id},
    )
    return [OwnershipPeriod(**r) for r in rows]


def _ensure_field(conn: Connection, field_id: int) -> None:
    if fetch_one(conn, "select 1 from marts.dim_field where field_id = %(id)s", {"id": field_id}):
        return
    raise HTTPException(404, f"field {field_id} not found")
