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
);
CREATE TABLE IF NOT EXISTS ml.share_price_models (
    run_id                    uuid             NOT NULL,
    run_at                    timestamptz      NOT NULL DEFAULT now(),
    model_version             text             NOT NULL,
    group_id                  text             NOT NULL,
    ticker                    text             NOT NULL,
    status                    text             NOT NULL,
    status_note               text,
    window_start              date,
    window_end                date,
    n_obs                     integer          NOT NULL,
    coefficients              jsonb            NOT NULL,
    covariance                jsonb,
    r2                        double precision,
    adj_r2                    double precision,
    resid_std                 double precision,
    excluded_months           jsonb            NOT NULL,
    backtest_quarters         integer          NOT NULL,
    backtest_r2_in_sample     double precision,
    backtest_r2_out_of_sample double precision,
    backtest_band_coverage    double precision,
    PRIMARY KEY (run_id, group_id)
);
CREATE TABLE IF NOT EXISTS ml.share_price_backtest (
    run_id        uuid             NOT NULL,
    group_id      text             NOT NULL,
    quarter_start date             NOT NULL,
    actual_return double precision NOT NULL,
    fitted_return double precision NOT NULL,
    oos_return    double precision,
    oos_lo        double precision,
    oos_hi        double precision,
    train_months  integer,
    PRIMARY KEY (run_id, group_id, quarter_start)
)
"""


def ensure_ml_tables(conn: psycopg.Connection) -> None:
    conn.execute(ML_DDL)
