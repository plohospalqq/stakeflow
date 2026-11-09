"""Facts the scenario parser needs from the marts. Fixed, parameterised SQL only."""

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from psycopg import Connection

from stakeflow_api.db import fetch_all, fetch_one

# A year smooths out maintenance months while staying close to today's field mix
SHARE_WINDOW_MONTHS = 12


@dataclass(frozen=True)
class FieldShare:
    group_id: str
    field_id: int
    share_pct: float  # the field's part of the company's net production, 0-100
    period_start: date
    period_end: date


@dataclass(frozen=True)
class FieldMatch:
    field_id: int
    name: str
    status: str
    owners: list[tuple[str, str, float]]  # (group_id, display name, current share of the field)


class ScenarioData(Protocol):
    def companies(self) -> dict[str, str]: ...
    def find_fields(self, name: str) -> list[FieldMatch]: ...
    def field_name(self, field_id: int) -> str | None: ...
    def field_shares(self, field_id: int) -> list[FieldShare]: ...


class MartsScenarioData:
    def __init__(self, conn: Connection) -> None:
        self._conn = conn

    def companies(self) -> dict[str, str]:
        """Company groups with production in the last year, plus the focus companies."""
        rows = fetch_all(
            self._conn,
            """
            select g.group_id, g.display_name
            from marts.dim_company_group as g
            where g.is_focus or exists (
                select 1 from marts.fct_group_production_monthly as p
                where p.group_id = g.group_id and p.oe_sm3 > 0
                  and p.month > (select latest_month from marts.meta_data_freshness)
                                - interval '12 months'
            )
            order by g.is_focus desc, g.display_name
            """,
        )
        return {r["group_id"]: r["display_name"] for r in rows}

    def find_fields(self, name: str) -> list[FieldMatch]:
        fields = fetch_all(
            self._conn,
            """
            select field_id, name, status
            from marts.dim_field
            where strpos(upper(name), upper(%(q)s)) > 0
            order by upper(name) = upper(%(q)s) desc, status = 'Producing' desc, name
            limit 5
            """,
            {"q": name.strip()},
        )
        owners = fetch_all(
            self._conn,
            """
            select o.field_id, o.group_id, g.display_name, sum(o.share_pct) as share_pct
            from marts.fct_field_ownership as o
            join marts.dim_company_group as g on g.group_id = o.group_id
            where o.is_current and o.field_id = any(%(ids)s)
            group by o.field_id, o.group_id, g.display_name
            order by share_pct desc
            """,
            {"ids": [f["field_id"] for f in fields]},
        )
        return [
            FieldMatch(
                field_id=f["field_id"],
                name=f["name"],
                status=f["status"],
                owners=[
                    (o["group_id"], o["display_name"], float(o["share_pct"]))
                    for o in owners
                    if o["field_id"] == f["field_id"]
                ],
            )
            for f in fields
        ]

    def field_name(self, field_id: int) -> str | None:
        row = fetch_one(
            self._conn, "select name from marts.dim_field where field_id = %(id)s", {"id": field_id}
        )
        return row["name"] if row else None

    def field_shares(self, field_id: int) -> list[FieldShare]:
        """The field's share of each owner's net production over the last 12 months of data."""
        rows = fetch_all(
            self._conn,
            """
            with period as (
                select (latest_month - make_interval(months => %(months)s - 1))::date
                           as period_start,
                       latest_month as period_end
                from marts.meta_data_freshness
            ),
            by_field as (
                select cf.group_id, cf.field_id, sum(cf.oe_sm3) as oe_sm3
                from marts.fct_company_field_production_monthly as cf, period
                where cf.month between period.period_start and period.period_end
                  and cf.group_id in (
                      select group_id from marts.fct_company_field_production_monthly
                      where field_id = %(field_id)s
                  )
                group by cf.group_id, cf.field_id
            )
            select b.group_id, b.field_id,
                   100 * b.oe_sm3 / nullif(sum(b.oe_sm3) over (partition by b.group_id), 0)
                       as share_pct,
                   p.period_start, p.period_end
            from by_field as b, period as p
            """,
            {"field_id": field_id, "months": SHARE_WINDOW_MONTHS},
        )
        return [
            FieldShare(
                group_id=r["group_id"],
                field_id=r["field_id"],
                share_pct=float(r["share_pct"]),
                period_start=r["period_start"],
                period_end=r["period_end"],
            )
            for r in rows
            if r["field_id"] == field_id and r["share_pct"] is not None and r["share_pct"] > 0
        ]
