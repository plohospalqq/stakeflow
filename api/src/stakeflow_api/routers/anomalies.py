"""Anomalies in monthly field production (latest run), with the expected band and the effect
on each current owner. Method: stakeflow_pipeline/ml/anomalies.py."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from stakeflow_api.db import fetch_all, fetch_one, get_conn
from stakeflow_api.schemas import Anomaly, AnomalyHit, AnomalyPoint, AnomalyRun

router = APIRouter(prefix="/anomalies", tags=["anomalies"])
Conn = Annotated[Connection, Depends(get_conn)]

SERIES_MONTHS = 18
METHOD = (
    "A month is an anomaly when a field's production is more than 10% and more than 3 robust "
    "standard deviations away from what its own history before that month suggests: a robust "
    "(Theil-Sen) trend through the previous 12 months, with a seasonal pattern where that "
    "forecast better in the past. The band is sized by the field's real one-month-ahead errors "
    "over the previous 24 months. Ramp-up, the last year of a field now shut down and fields "
    "under 1,000 boe/d are not judged. Severity is the size of the miss: high from 10,000 "
    "boe/d, medium from 3,000. Effects on owners use today's shares."
)


def _kboed(boe_per_day: float) -> float:
    return boe_per_day / 1000


@router.get("", response_model=list[Anomaly], response_model_by_alias=True)
def list_anomalies(
    conn: Conn,
    severity: Annotated[Literal["high", "medium", "low"] | None, Query()] = None,
    field_id: Annotated[int | None, Query(description="Only this field")] = None,
    company: Annotated[
        str | None, Query(max_length=80, description="Only anomalies affecting this owner")
    ] = None,
    since: Annotated[date | None, Query(description="First month")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[Anomaly]:
    """Flagged months of the latest run (last 24 months), newest and largest first."""
    if company is not None and not fetch_one(
        conn, "select 1 from marts.dim_company_group where group_id = %(id)s", {"id": company}
    ):
        raise HTTPException(404, f"company {company!r} not found")
    rows = fetch_all(
        conn,
        """
        select a.anomaly_id, a.field_id, a.field_name, a.operator_name, a.month,
               a.pct_vs_expected, a.severity, a.note, a.actual_boe_d, a.expected_boe_d
        from marts.fct_anomalies as a
        where (%(severity)s::text is null or a.severity = %(severity)s)
          and (%(field_id)s::int is null or a.field_id = %(field_id)s)
          and (%(since)s::date is null or a.month >= %(since)s)
          and (%(company)s::text is null or exists (
                select 1 from marts.fct_anomaly_impacts as i
                where i.anomaly_id = a.anomaly_id and i.group_id = %(company)s))
        order by a.month desc, abs(a.actual_boe_d - a.expected_boe_d) desc
        limit %(limit)s
        """,
        {
            "severity": severity,
            "field_id": field_id,
            "since": since,
            "company": company,
            "limit": limit,
        },
    )
    if not rows:
        return []

    hits: dict[str, list[AnomalyHit]] = {}
    for h in fetch_all(
        conn,
        """
        select anomaly_id, group_id, group_name, is_focus, share_pct::float8 as share_pct,
               impact_kboe_d
        from marts.fct_anomaly_impacts
        where anomaly_id = any(%(ids)s)
        order by abs(impact_kboe_d) desc
        """,
        {"ids": [r["anomaly_id"] for r in rows]},
    ):
        hits.setdefault(h["anomaly_id"], []).append(
            AnomalyHit(
                company_id=h["group_id"],
                company_name=h["group_name"],
                is_focus=h["is_focus"],
                share_pct=h["share_pct"],
                kboed=h["impact_kboe_d"],
            )
        )

    bands: dict[int, list[dict]] = {}
    for b in fetch_all(
        conn,
        """
        select field_id, month, actual_boe_d, expected_boe_d, lo_boe_d, hi_boe_d
        from marts.fct_anomaly_evaluations
        where field_id = any(%(fields)s) and expected_boe_d is not null
        order by field_id, month
        """,
        {"fields": list({r["field_id"] for r in rows})},
    ):
        bands.setdefault(b["field_id"], []).append(b)

    return [
        _to_anomaly(r, bands.get(r["field_id"], []), hits.get(r["anomaly_id"], [])) for r in rows
    ]


def _to_anomaly(row: dict, band: list[dict], hits: list[AnomalyHit]) -> Anomaly:
    month: date = row["month"]
    # The band evaluations are one per month, so the last 18 up to the anomaly are the chart
    window = [b for b in band if b["month"] <= month][-SERIES_MONTHS:]
    return Anomaly(
        id=row["anomaly_id"],
        field_id=row["field_id"],
        field_name=row["field_name"],
        operator_name=row["operator_name"],
        month=month,
        pct_vs_expected=100 * row["pct_vs_expected"],
        severity=row["severity"],
        note=row["note"],
        expected=_kboed(row["expected_boe_d"]),
        actual=_kboed(row["actual_boe_d"]),
        series=[
            AnomalyPoint(
                month=b["month"],
                actual=_kboed(b["actual_boe_d"]),
                expected=_kboed(b["expected_boe_d"]),
                lo=_kboed(b["lo_boe_d"]),
                hi=_kboed(b["hi_boe_d"]),
            )
            for b in window
        ],
        hits=hits,
    )


@router.get("/run", response_model=AnomalyRun, response_model_by_alias=True)
def anomaly_run(conn: Conn) -> AnomalyRun:
    """When the latest run happened, what it looked at, and how it decides."""
    row = fetch_one(conn, "select * from marts.meta_anomaly_run")
    if row is None:
        raise HTTPException(503, "no anomaly run yet; run the pipeline")
    return AnomalyRun(
        run_at=row["run_at"],
        model_version=row["model_version"],
        latest_month=row["latest_month"],
        flagged_from=row["flagged_from"],
        fields_evaluated=row["fields_evaluated"],
        anomaly_count=row["anomaly_count"],
        method=METHOD,
        params=row["params"],
    )
