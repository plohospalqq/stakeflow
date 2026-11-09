"""ML runs against the real marts. Everything happens in a transaction that is rolled back,
so a test run never becomes the "latest run" the API serves."""

import psycopg
import pytest

from stakeflow_pipeline.ml.anomaly_run import run_anomalies

pytestmark = pytest.mark.db


@pytest.fixture
def marts_conn(db_conn: psycopg.Connection):
    if db_conn.execute("select to_regclass('marts.fct_field_production_monthly')").fetchone() == (
        None,
    ):
        pytest.skip("marts not built; run dbt first")
    yield db_conn
    db_conn.rollback()


def test_anomaly_run_writes_bands_consistent_with_flags(marts_conn):
    result = run_anomalies(marts_conn)
    assert result is not None

    total, flagged, band_ok, flag_ok = marts_conn.execute(
        """
        select count(*),
               count(*) filter (where is_anomaly),
               bool_and(lo_boe_d <= expected_boe_d and expected_boe_d <= hi_boe_d)
                   filter (where expected_boe_d is not null),
               bool_and(is_anomaly = (actual_boe_d < lo_boe_d or actual_boe_d > hi_boe_d))
                   filter (where excluded_reason is null and expected_boe_d is not null)
        from ml.anomaly_evaluations where run_id = %s
        """,
        (result.run_id,),
    ).fetchone()
    assert total > 0
    assert flagged >= result.anomaly_count
    assert band_ok and flag_ok
