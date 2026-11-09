"""Tables in the `ml` schema. Append-only: each run adds rows under a new run_id, and the marts
(dbt, tag `ml`) expose the latest run to the API.

The same DDL is in dbt/macros/external_tables.sql, so dbt can build its views before any ML run
has happened. Keep the two in sync.
"""

import psycopg

ML_DDL = """
CREATE TABLE IF NOT EXISTS ml.anomaly_runs (
    run_id           uuid        PRIMARY KEY,
    run_at           timestamptz NOT NULL DEFAULT now(),
    model_version    text        NOT NULL,
    params           jsonb       NOT NULL,
    latest_month     date        NOT NULL,
    evaluated_from   date        NOT NULL,
    flagged_from     date        NOT NULL,
    fields_evaluated integer     NOT NULL,
    anomaly_count    integer     NOT NULL
);
CREATE TABLE IF NOT EXISTS ml.anomaly_evaluations (
    run_id          uuid             NOT NULL REFERENCES ml.anomaly_runs (run_id),
    field_id        integer          NOT NULL,
    month           date             NOT NULL,
    actual_boe_d    double precision NOT NULL,
    expected_boe_d  double precision,
    lo_boe_d        double precision,
    hi_boe_d        double precision,
    sigma_log       double precision,
    pct_vs_expected double precision,
    seasonal        boolean          NOT NULL,
    is_anomaly      boolean          NOT NULL,
    severity        text,
    excluded_reason text,
    note            text,
    PRIMARY KEY (run_id, field_id, month)
)
"""


def ensure_ml_tables(conn: psycopg.Connection) -> None:
    conn.execute(ML_DDL)
