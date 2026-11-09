"""Ask against the real database: the reader role, the timeout and the row cap.

Needs the marts and the `stakeflow_reader` role (infra/postgres/init/03-reader-role.sh) with
STAKEFLOW_READER_PASSWORD set; skips otherwise. The model is still a fake.
"""

import time
from collections.abc import Iterator

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from stakeflow_api.ask.catalog import load_catalog
from stakeflow_api.ask.executor import (
    MAX_ROWS,
    QueryFailed,
    QueryTimedOut,
    ReaderNotConfigured,
    ReadOnlyExecutor,
    reader_conninfo_from_env,
)
from stakeflow_api.ask.sql_guard import validate_sql
from stakeflow_api.db import conninfo_from_env
from stakeflow_api.deps import get_llm
from stakeflow_api.main import app
from tests.fakes import FakeAnthropic, tool_call


@pytest.fixture(scope="module")
def owner_conn() -> Iterator[psycopg.Connection]:
    try:
        conn = psycopg.connect(conninfo_from_env(), connect_timeout=3, autocommit=True)
        conn.execute("select 1 from marts.meta_data_freshness")
    except (KeyError, psycopg.Error) as exc:
        pytest.skip(f"marts not available ({exc!r}); run `make up` and the pipeline")
    with conn:
        yield conn


@pytest.fixture(scope="module")
def reader_conninfo(owner_conn) -> str:
    try:
        conninfo = reader_conninfo_from_env()
        with psycopg.connect(conninfo):
            pass
    except (ReaderNotConfigured, psycopg.Error) as exc:
        pytest.skip(f"reader role not usable ({exc!r}); run infra/postgres/init/03-reader-role.sh")
    return conninfo


@pytest.fixture(scope="module")
def allowed(owner_conn):
    return load_catalog(owner_conn).allowed_tables


def raw_table(owner_conn) -> str:
    row = owner_conn.execute(
        "select table_name from information_schema.tables where table_schema = 'raw' limit 1"
    ).fetchone()
    assert row, "no raw tables to test with"
    return f"raw.{row[0]}"


WRITES = [
    "create table marts.ask_probe (x int)",
    "create table public.ask_probe (x int)",
    "create schema ask_probe",
    "insert into marts.dim_company_group (group_id, display_name) values ('x', 'x')",
    "update marts.dim_field set name = name",
    "delete from marts.dim_field",
    "truncate marts.dim_field",
    "drop table marts.dim_field",
    "alter table marts.dim_field add column ask_probe int",
    "select * into marts.ask_probe from marts.dim_field",
    "comment on table marts.dim_field is 'x'",
]


@pytest.mark.parametrize("statement", WRITES)
def test_reader_role_cannot_write_even_without_read_only_mode(reader_conninfo, statement):
    # Turn the read-only default off on purpose: privileges must stop the write on their own
    with psycopg.connect(reader_conninfo) as conn:
        conn.execute("set default_transaction_read_only = off")
        conn.commit()
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(statement)


@pytest.mark.parametrize(
    "statement", ["delete from marts.dim_field", "create table marts.y (y int)"]
)
def test_reader_sessions_are_read_only_by_default(reader_conninfo, statement):
    read_only = psycopg.errors.ReadOnlySqlTransaction
    with psycopg.connect(reader_conninfo) as conn, pytest.raises(read_only):
        conn.execute(statement)


def test_reader_role_cannot_read_other_layers_or_files(reader_conninfo, owner_conn):
    with psycopg.connect(reader_conninfo) as conn:
        for statement in [
            f"select * from {raw_table(owner_conn)} limit 1",
            "select * from staging.stg_sodir__fields limit 1",
            "select pg_read_file('/etc/passwd')",
            "select * from pg_authid",
        ]:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)
            conn.rollback()


def test_reader_role_defaults_apply_without_any_client_options(reader_conninfo):
    # The API also sets these per connection; the role must hold them on its own
    params = conninfo_to_dict(reader_conninfo)
    params.pop("options")
    with psycopg.connect(make_conninfo(**params)) as conn:
        assert conn.execute("show statement_timeout").fetchone() == ("3s",)
        assert conn.execute("show default_transaction_read_only").fetchone() == ("on",)
        assert conn.execute("show search_path").fetchone() == ("marts, ml",)
        attrs = conn.execute(
            "select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls "
            "from pg_roles where rolname = current_user"
        ).fetchone()
        assert attrs == (False, False, False, False)


def test_a_slow_query_is_stopped_after_three_seconds(reader_conninfo, allowed):
    # Passes the guard (it only reads) but cross-joins ~30k rows three times
    guarded = validate_sql(
        "select count(*) from marts.fct_field_production_monthly a, "
        "marts.fct_field_production_monthly b, marts.fct_field_production_monthly c",
        allowed,
    )
    started = time.monotonic()
    with pytest.raises(QueryTimedOut, match="longer than 3 s"):
        ReadOnlyExecutor(reader_conninfo)(guarded.sql)
    assert time.monotonic() - started < 6


def test_results_are_capped_at_500_rows(reader_conninfo, allowed):
    sql = "select field_id, month from marts.fct_field_production_monthly"
    guarded = validate_sql(sql, allowed)
    result = ReadOnlyExecutor(reader_conninfo)(guarded.sql)
    assert len(result.rows) == MAX_ROWS and result.truncated
    assert result.columns == ["field_id", "month"]
    assert isinstance(result.rows[0][0], int) and isinstance(result.rows[0][1], str)


def test_postgres_errors_come_back_as_repairable_messages(reader_conninfo, allowed):
    guarded = validate_sql("select no_such_column from marts.dim_field", allowed)
    with pytest.raises(QueryFailed, match="no_such_column"):
        ReadOnlyExecutor(reader_conninfo)(guarded.sql)


def test_catalog_lists_marts_with_descriptions_and_hides_geometry(owner_conn):
    catalog = load_catalog(owner_conn)
    tables = {t.qualified_name: t for t in catalog.tables}
    assert {"marts.dim_field", "marts.fct_field_ownership"} <= tables.keys()
    assert all(name.split(".")[0] in {"marts", "ml"} for name in tables)
    columns = {c.name for c in tables["marts.dim_field"].columns}
    assert "name" in columns and "geom" not in columns and "centroid" not in columns
    assert "\n  geom " not in catalog.describe()


def test_ask_end_to_end_with_a_fake_model(client, reader_conninfo):
    sql = (
        "select g.display_name as owner, sum(o.share_pct) as share_pct "
        "from marts.fct_field_ownership o join marts.dim_field f using (field_id) "
        "join marts.dim_company_group g on g.group_id = o.group_id "
        "where f.name = 'JOHAN SVERDRUP' and o.is_current group by 1 order by 2 desc"
    )
    fake = FakeAnthropic(
        tool_call("run_sql", {"understanding": "Current owners of Johan Sverdrup", "sql": sql}),
        tool_call(
            "present_answer",
            {
                "answer": "Equinor is the largest owner.",
                "sanity_check": "Shares add up to 100%",
                "chart": {
                    "type": "bar",
                    "label_column": "owner",
                    "value_column": "share_pct",
                    "previous_column": None,
                    "unit": "%",
                    "value_legend": "Share today",
                    "previous_legend": None,
                },
                "follow_ups": ["Who operates Johan Sverdrup?"],
            },
        ),
    )
    app.dependency_overrides[get_llm] = lambda: fake
    try:
        body = client.post("/ask", json={"question": "Who owns Johan Sverdrup?"}).json()
    finally:
        app.dependency_overrides.clear()

    assert body["matched"] is True
    assert body["columns"] == ["owner", "share_pct"]
    assert sum(row[1] for row in body["rows"]) == pytest.approx(100, abs=0.01)
    assert body["rows"][0][0] == "Equinor (NCS only)"
    assert body["answer"].startswith("Equinor (NCS only)")
    assert "marts.fct_field_ownership" in body["sql"]
    assert body["steps"][1] == {
        "label": "Found 3 tables",
        "detail": "dim_company_group, dim_field, fct_field_ownership",
    }
