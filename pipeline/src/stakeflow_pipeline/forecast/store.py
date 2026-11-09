"""The `ml` schema: model runs, field forecasts, model cards and the prediction log.

Like `raw`, every table here is append-only and enforced by the database itself: a trigger
rejects UPDATE, DELETE and TRUNCATE. A new model run adds rows; a revised prediction is a new
row. The `*_latest` views pick the newest run for the API-facing dbt models.

Python owns this DDL (as it does for `raw`), so the tables exist before dbt reads them.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from stakeflow_pipeline.forecast.nowcast import OwnershipPeriod

DDL = """
CREATE TABLE IF NOT EXISTS ml.model_runs (
    run_id                uuid PRIMARY KEY,
    model_version         text        NOT NULL,
    started_at            timestamptz NOT NULL,
    finished_at           timestamptz NOT NULL,
    data_through          date        NOT NULL,
    ingestion_run_ids     jsonb       NOT NULL,
    params                jsonb       NOT NULL,
    fields_total          integer     NOT NULL,
    fields_arps           integer     NOT NULL,
    fields_backtested     integer     NOT NULL,
    backtest_mape_pct     double precision,
    backtest_wape_pct     double precision,
    backtest_bias_pct     double precision,
    naive_mape_pct        double precision,
    naive_wape_pct        double precision,
    naive_bias_pct        double precision,
    backtest_coverage_pct double precision
);

CREATE TABLE IF NOT EXISTS ml.field_forecast (
    run_id     uuid             NOT NULL REFERENCES ml.model_runs (run_id),
    field_id   integer          NOT NULL,
    month      date             NOT NULL,
    p10_oe_sm3 double precision NOT NULL,
    p50_oe_sm3 double precision NOT NULL,
    p90_oe_sm3 double precision NOT NULL,
    PRIMARY KEY (run_id, field_id, month),
    CHECK (p10_oe_sm3 <= p50_oe_sm3 AND p50_oe_sm3 <= p90_oe_sm3)
);

CREATE TABLE IF NOT EXISTS ml.field_model_card (
    run_id                 uuid    NOT NULL REFERENCES ml.model_runs (run_id),
    field_id               integer NOT NULL,
    status                 text    NOT NULL
        CHECK (status IN ('arps', 'plateau', 'ramp_up', 'too_short', 'shut_down')),
    method                 text    NOT NULL,
    qi_sm3_per_day         double precision,
    b                      double precision,
    di_nominal_per_year    double precision,
    first_year_decline_pct double precision,
    fit_start              date,
    fit_end                date,
    fit_months             integer NOT NULL,
    fit_rmse_log           double precision,
    seasonal_swing_pct     double precision NOT NULL,
    backtest_months        integer,
    backtest_mape_pct      double precision,
    backtest_bias_pct      double precision,
    naive_mape_pct         double precision,
    naive_bias_pct         double precision,
    backtest_coverage_pct  double precision,
    PRIMARY KEY (run_id, field_id)
);

CREATE TABLE IF NOT EXISTS ml.predictions (
    id              uuid        PRIMARY KEY,
    group_id        text        NOT NULL,
    quarter_start   date        NOT NULL,
    predicted_at    timestamptz NOT NULL,
    as_of           date        NOT NULL,
    data_through    date        NOT NULL,
    months_in_data  smallint    NOT NULL CHECK (months_in_data BETWEEN 0 AND 3),
    value_kboe_d    numeric(9, 1) NOT NULL,
    lo              numeric(9, 1) NOT NULL,
    hi              numeric(9, 1) NOT NULL,
    model_version   text        NOT NULL,
    kind            text        NOT NULL CHECK (kind IN ('live', 'backtest')),
    input_hash      text        NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
    prediction_hash text        NOT NULL UNIQUE CHECK (prediction_hash ~ '^[0-9a-f]{64}$'),
    inputs          jsonb       NOT NULL,
    run_id          uuid        REFERENCES ml.model_runs (run_id),
    CHECK (lo <= value_kboe_d AND value_kboe_d <= hi),
    CHECK (date_trunc('quarter', quarter_start) = quarter_start)
);
CREATE INDEX IF NOT EXISTS predictions_group_quarter_idx
    ON ml.predictions (group_id, quarter_start);

CREATE OR REPLACE FUNCTION ml.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '%.% is append-only: % is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE OR REPLACE VIEW ml.latest_model_run AS
SELECT * FROM ml.model_runs ORDER BY finished_at DESC LIMIT 1;

CREATE OR REPLACE VIEW ml.field_forecast_latest AS
SELECT f.*
FROM ml.field_forecast AS f
WHERE f.run_id = (SELECT run_id FROM ml.latest_model_run);

CREATE OR REPLACE VIEW ml.field_model_card_latest AS
SELECT c.*, r.model_version, r.finished_at AS run_at, r.data_through
FROM ml.field_model_card AS c
JOIN ml.latest_model_run AS r USING (run_id);
"""

APPEND_ONLY_TABLES = ("model_runs", "field_forecast", "field_model_card", "predictions")

TRIGGERS = """
CREATE OR REPLACE TRIGGER {table}_append_only
    BEFORE UPDATE OR DELETE ON ml.{table}
    FOR EACH ROW EXECUTE FUNCTION ml.reject_change();
CREATE OR REPLACE TRIGGER {table}_no_truncate
    BEFORE TRUNCATE ON ml.{table}
    FOR EACH STATEMENT EXECUTE FUNCTION ml.reject_change();
"""

# Raw layers whose snapshots feed a forecast; their run ids go into every input hash
INPUT_LAYERS = ("profiles", "field_licensee_hst", "company")


def ensure_tables(conn: psycopg.Connection) -> None:
    conn.execute("CREATE SCHEMA IF NOT EXISTS ml")
    conn.execute(DDL)
    for table in APPEND_ONLY_TABLES:
        conn.execute(TRIGGERS.format(table=table))


@dataclass(frozen=True)
class Inputs:
    """Everything a run reads from the warehouse, loaded once."""

    latest_month: date
    field_volumes: dict[int, dict[date, float]]
    group_volumes: dict[str, dict[date, float]]
    ownership: list[OwnershipPeriod]
    focus_groups: list[str]
    ingestion_run_ids: dict[str, str]


def load_inputs(conn: psycopg.Connection) -> Inputs:
    field_volumes: dict[int, dict[date, float]] = defaultdict(dict)
    for field_id, month, oe in conn.execute(
        "select field_id, month, oe_sm3::float8 from marts.fct_field_production_monthly"
    ):
        field_volumes[field_id][month] = oe
    if not field_volumes:
        raise RuntimeError("marts.fct_field_production_monthly is empty; build dbt first")

    focus = [
        row[0]
        for row in conn.execute(
            "select group_id from marts.dim_company_group where is_focus order by group_id"
        )
    ]
    group_volumes: dict[str, dict[date, float]] = defaultdict(dict)
    for group_id, month, oe in conn.execute(
        "select group_id, month, oe_sm3::float8 from marts.fct_group_production_monthly"
        " where group_id = any(%s)",
        (focus,),
    ):
        group_volumes[group_id][month] = oe

    ownership = [
        OwnershipPeriod(field_id, group_id, valid_from, valid_to, float(share))
        for field_id, group_id, valid_from, valid_to, share in conn.execute(
            "select field_id, group_id, valid_from, valid_to, share_pct"
            " from marts.fct_field_ownership where group_id = any(%s)",
            (focus,),
        )
    ]
    run_ids = {
        layer: str(run_id)
        for layer, run_id in conn.execute(
            """
            select distinct on (layer) layer, run_id
            from raw.ingestion_runs
            where finished_at is not null and layer = any(%s)
            order by layer, finished_at desc
            """,
            (list(INPUT_LAYERS),),
        )
    }
    return Inputs(
        latest_month=max(max(v) for v in field_volumes.values()),
        field_volumes=dict(field_volumes),
        group_volumes=dict(group_volumes),
        ownership=ownership,
        focus_groups=focus,
        ingestion_run_ids=run_ids,
    )


def existing_backtests(conn: psycopg.Connection, model_version: str) -> set[tuple[str, date]]:
    rows = conn.execute(
        "select group_id, quarter_start from ml.predictions"
        " where kind = 'backtest' and model_version = %s",
        (model_version,),
    )
    return {(group_id, quarter_start) for group_id, quarter_start in rows}


def existing_input_hashes(conn: psycopg.Connection) -> set[str]:
    return {row[0] for row in conn.execute("select input_hash from ml.predictions")}


def insert_rows(conn: psycopg.Connection, table: str, rows: list[dict[str, Any]]) -> None:
    """Plain INSERTs into an ml table (dict values become jsonb)."""
    if not rows:
        return
    columns = list(rows[0])
    query = sql.SQL("INSERT INTO {table} ({columns}) VALUES ({values})").format(
        table=sql.Identifier("ml", table),
        columns=sql.SQL(", ").join(map(sql.Identifier, columns)),
        values=sql.SQL(", ").join(map(sql.Placeholder, columns)),
    )
    with conn.cursor() as cur:
        cur.executemany(
            query,
            [{k: Jsonb(v) if isinstance(v, dict) else v for k, v in row.items()} for row in rows],
        )
