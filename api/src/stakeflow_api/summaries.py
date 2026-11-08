"""Shared "latest month" summary: value, month-on-month, year-on-year and product mix.

Companies and fields both show the same KPI block, so the SQL and the mapping live here once.
The latest month is the newest month in Sodir's data overall, so a field that stopped producing
shows up with no current value instead of a stale one.
"""

from typing import Literal

from stakeflow_api.schemas import LatestSummary

Entity = Literal["group", "field"]

_SOURCES: dict[Entity, tuple[str, str]] = {
    "group": ("marts.fct_group_production_monthly", "group_id"),
    "field": ("marts.fct_field_production_monthly", "field_id"),
}


def latest_summary_ctes(entity: Entity) -> str:
    """CTEs `cur`, `prev`, `yoy` keyed by the entity's id column."""
    table, key = _SOURCES[entity]
    return f"""
        m as (select max(month) as latest from marts.fct_field_production_monthly),
        cur as (
            select p.{key} as key, p.month, p.boe_per_day, p.oe_sm3, p.oil_sm3,
                   p.gas_oe_sm3, p.ngl_sm3 + p.condensate_sm3 as ngl_condensate_sm3
            from {table} as p, m where p.month = m.latest
        ),
        prev as (
            select p.{key} as key, p.boe_per_day
            from {table} as p, m where p.month = (m.latest - interval '1 month')::date
        ),
        yoy as (
            select p.{key} as key, p.boe_per_day
            from {table} as p, m where p.month = (m.latest - interval '1 year')::date
        )
    """


SUMMARY_COLUMNS = """
    cur.month as latest_month, cur.boe_per_day as latest_boe_per_day, cur.oe_sm3 as latest_oe_sm3,
    cur.oil_sm3 as latest_oil_sm3, cur.gas_oe_sm3 as latest_gas_oe_sm3,
    cur.ngl_condensate_sm3 as latest_ngl_condensate_sm3,
    prev.boe_per_day as prev_boe_per_day, yoy.boe_per_day as yoy_boe_per_day
"""

SUMMARY_JOINS = """
    left join cur on cur.key = {key}
    left join prev on prev.key = {key}
    left join yoy on yoy.key = {key}
"""


def to_latest_summary(row: dict) -> LatestSummary | None:
    if row.get("latest_month") is None or not row.get("latest_oe_sm3"):
        return None
    oe = float(row["latest_oe_sm3"])
    return LatestSummary(
        month=row["latest_month"],
        boe_per_day=float(row["latest_boe_per_day"]),
        oe_sm3=oe,
        prev_month_boe_per_day=_float_or_none(row["prev_boe_per_day"]),
        year_ago_boe_per_day=_float_or_none(row["yoy_boe_per_day"]),
        oil_share=float(row["latest_oil_sm3"]) / oe,
        gas_share=float(row["latest_gas_oe_sm3"]) / oe,
        ngl_condensate_share=float(row["latest_ngl_condensate_sm3"]) / oe,
    )


def _float_or_none(value: object) -> float | None:
    return None if value is None else float(value)  # type: ignore[arg-type]
