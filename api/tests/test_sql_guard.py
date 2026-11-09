"""The SQL guard: what model-written SQL may and may not do. Pure, no database."""

import pytest

from stakeflow_api.ask.sql_guard import UnsafeSQL, validate_sql

ALLOWED = {
    "marts": frozenset(
        {
            "dim_field",
            "dim_company_group",
            "fct_field_ownership",
            "fct_field_production_monthly",
            "fct_group_production_monthly",
        }
    ),
    "ml": frozenset({"forecast_monthly"}),
}


def check(sql: str):
    return validate_sql(sql, ALLOWED)


@pytest.mark.parametrize(
    "sql",
    [
        "select name from marts.dim_field",
        "SELECT f.name, sum(p.oe_sm3) FROM marts.fct_field_production_monthly p "
        "JOIN marts.dim_field f ON f.field_id = p.field_id GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
        "with latest as (select max(month) as m from marts.fct_field_production_monthly) "
        "select * from latest",
        "select name from marts.dim_field "
        "union all select display_name from marts.dim_company_group",
        "select * from ml.forecast_monthly",
        "select g.month::date from generate_series(date '2025-01-01', date '2025-12-01', "
        "interval '1 month') as g(month)",
        "select round((sum(oe_sm3) * 6.2898 / 31 / 1000)::numeric, 1) "
        "from marts.fct_field_production_monthly",
        "select count(*) filter (where status = 'Producing') from marts.dim_field",
        "select name from marts.dim_field where name ilike '%sverdrup%'",
        "select $$a; drop table marts.dim_field; $$ as harmless_text",
        "table marts.dim_field",
    ],
)
def test_accepts_read_only_queries(sql):
    assert check(sql).sql


@pytest.mark.parametrize(
    "sql",
    [
        "drop table marts.dim_field",
        "create table marts.x as select 1",
        "insert into marts.dim_field (field_id) values (1)",
        "update marts.dim_field set name = 'x'",
        "delete from marts.dim_field",
        "truncate marts.dim_field",
        "alter table marts.dim_field add column x int",
        "grant select on marts.dim_field to public",
        "copy marts.dim_field to '/tmp/out.csv'",
        "merge into marts.dim_field t using marts.dim_field s on t.field_id = s.field_id "
        "when matched then delete",
        "comment on table marts.dim_field is 'x'",
    ],
)
def test_rejects_ddl_and_dml(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "set statement_timeout = 0",
        "reset all",
        "begin",
        "explain analyze select * from marts.dim_field",
        "vacuum marts.dim_field",
        "do $$ begin perform 1; end $$",
        "values (1)",
        "show search_path",
    ],
)
def test_rejects_anything_that_is_not_a_query(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


def test_rejects_data_modifying_cte():
    with pytest.raises(UnsafeSQL, match="DELETE"):
        check("with d as (delete from marts.dim_field returning *) select * from d")


def test_rejects_select_into_and_row_locks():
    with pytest.raises(UnsafeSQL, match="INTO"):
        check("select * into marts.copy from marts.dim_field")
    with pytest.raises(UnsafeSQL, match="FOR UPDATE"):
        check("select * from marts.dim_field for update")


@pytest.mark.parametrize(
    "sql",
    [
        "select 1; drop table marts.dim_field",
        "select 1; select 2",
        "select name from marts.dim_field; -- looks like the end\ndelete from marts.dim_field",
        "select 1 /* harmless */; update marts.dim_field set name = 'x'",
        "/* a comment first */ drop table marts.dim_field",
        "begin; select 1; commit",
    ],
)
def test_rejects_multiple_statements_even_behind_comments(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "select name from marts.dim_field -- ; drop table marts.dim_field",
        "select name /* ; drop table marts.dim_field; */ from marts.dim_field",
        "select name from marts.dim_field /* /* nested */ ; drop table marts.dim_field */",
    ],
)
def test_what_runs_has_no_comments_to_hide_anything_in(sql):
    # Either the parser sees a second statement and refuses, or the comment is dropped from what
    # runs. A statement hidden in a comment can never reach Postgres.
    try:
        guarded = check(sql)
    except UnsafeSQL:
        return
    assert "drop" not in guarded.sql.lower()
    assert "--" not in guarded.sql and "/*" not in guarded.sql


@pytest.mark.parametrize(
    "sql",
    [
        "select pg_sleep(10)",
        'select "pg_sleep"(10)',
        "select pg_catalog.pg_sleep(10)",
        "select * from marts.dim_field, lateral pg_sleep(10)",
        "select (select pg_sleep(10))",
        "select pg_read_file('/etc/passwd')",
        "select pg_ls_dir('.')",
        "select pg_terminate_backend(1)",
        "select pg_advisory_lock(1)",
        "select lo_import('/etc/passwd')",
        "select lo_export(1, '/tmp/x')",
        "select dblink('host=example.com', 'select 1')",
        "select * from dblink_exec('drop table x')",
        "select set_config('statement_timeout', '0', false)",
        "select current_setting('data_directory')",
        "select query_to_xml('select * from raw.sodir_field', true, true, '')",
        "select nextval('some_seq')",
        "select pg_catalog.now()",
    ],
)
def test_rejects_denied_and_schema_qualified_functions(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "select * from raw.sodir_field",
        "select * from staging.stg_sodir__fields",
        "select * from public.spatial_ref_sys",
        "select * from information_schema.tables",
        "select * from pg_catalog.pg_roles",
        "select * from pg_roles",  # unqualified: Postgres would find it in pg_catalog
        "select * from pg_shadow",
        "select * from stakeflow.marts.dim_field",
        "select * from marts.no_such_table",
        "select * from no_such_table",
        'select * from marts."DIM_FIELD"',  # quoted upper case is a different table in Postgres
    ],
)
def test_rejects_tables_outside_the_allow_list(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


def test_qualifies_unqualified_tables_and_reports_tables_used():
    guarded = check(
        "with f as (select field_id, name from dim_field) "
        "select f.name, o.share_pct from f join marts.fct_field_ownership o using (field_id)"
    )
    assert "marts.dim_field" in guarded.sql
    assert guarded.tables == ["marts.dim_field", "marts.fct_field_ownership"]


def test_upper_case_unquoted_names_fold_like_postgres():
    assert check("SELECT NAME FROM MARTS.DIM_FIELD").tables == ["marts.dim_field"]


def test_cte_names_are_not_tables():
    guarded = check("with pg_roles as (select 1 as x) select * from pg_roles")
    assert guarded.tables == []


@pytest.mark.parametrize("sql", ["", "   ", ";", "select from where", "select 'unterminated"])
def test_rejects_empty_or_unparseable(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


def test_rejects_very_long_sql():
    with pytest.raises(UnsafeSQL, match="longer"):
        check("select 1 " + " " * 9000)
