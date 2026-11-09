"""The SQL guard: what model-written SQL may and may not do. Pure, no database."""

import re
from pathlib import Path

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
        "select nextval('some_seq')",
        "select pg_catalog.now()",
        "select pg_catalog.lower(name) from marts.dim_field",
        "select * from pg_catalog.generate_series(1, 3)",
        "select version()",
        "select md5(name) from marts.dim_field",
        "select format('%s', name) from marts.dim_field",
        "select regexp_replace(name, 'a', 'b') from marts.dim_field",
    ],
)
def test_rejects_functions_not_on_the_allow_list(sql):
    with pytest.raises(UnsafeSQL, match="not allowed"):
        check(sql)


@pytest.mark.parametrize(
    "sql",
    [
        # Each of these runs the SQL text it is given; an allow-list refuses them all
        "select query_to_xml('select * from raw.sodir_field', true, true, '')",
        "select query_to_xmlschema('select 1', true, true, '')",
        "select query_to_xml_and_xmlschema('select 1', true, true, '')",
        "select cursor_to_xml('c', 1, true, true, '')",
        "select table_to_xml('raw.sodir_field', true, true, '')",
        "select schema_to_xml('raw', true, true, '')",
        "select database_to_xml(true, true, '')",
        "select ts_stat('select to_tsvector(name) from marts.dim_field')",
        "select ts_rewrite('a'::tsquery, 'select 1')",
        "select * from crosstab('select 1, 2, 3') as t(a int, b int)",
        "select * from crosstab2('select 1, 2, 3')",
        "select * from crosstab3('select 1, 2, 3')",
        "select * from crosstab4('select 1, 2, 3')",
        "select * from connectby('marts.dim_field', 'a', 'b', '1', 0) as t(a text)",
        "select * from xpath_table('k', 'd', 'raw.x', '/a', 'true') as t(k int)",
        "select * from dblink('select 1') as t(x int)",
    ],
)
def test_rejects_functions_that_run_sql_given_as_text(sql):
    with pytest.raises(UnsafeSQL, match="not allowed"):
        check(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "select count(*), count(distinct field_id), sum(oe_sm3), avg(oe_sm3), min(month), "
        "max(month) from marts.fct_field_production_monthly",
        "select stddev(oe_sm3), variance(oe_sm3), percentile_cont(0.5) within group "
        "(order by oe_sm3) from marts.fct_field_production_monthly",
        "select string_agg(name, ', ' order by name), array_agg(field_id) from marts.dim_field",
        "select row_number() over (order by name), rank() over (order by name), "
        "dense_rank() over (order by name), ntile(4) over (order by name) from marts.dim_field",
        "select lag(oe_sm3) over (partition by field_id order by month), "
        "lead(oe_sm3, 12) over (partition by field_id order by month), "
        "first_value(oe_sm3) over (partition by field_id order by month) "
        "from marts.fct_field_production_monthly",
        "select abs(x), round(x::numeric, 1), trunc(x), floor(x), ceil(x), sqrt(x), power(x, 2), "
        "ln(x), log(x), mod(1, 2), sign(x) from (select 2.5 as x) as t",
        "select coalesce(a, 0), nullif(a, 0), greatest(a, 1), least(a, 1), "
        "case when a > 0 then 'up' else 'down' end from (select 1 as a) as t",
        "select lower(name), upper(name), initcap(name), length(name), substring(name, 1, 3), "
        "left(name, 2), trim(name), replace(name, ' ', '_'), concat(name, '!'), "
        "split_part(name, ' ', 1), strpos(name, 'A'), lpad(name, 20) from marts.dim_field",
        "select date_trunc('quarter', month)::date, extract(year from month), "
        "date_part('month', month), make_date(2025, 1, 1), age(month), to_char(month, 'YYYY-MM'), "
        "month - make_interval(months => 11), current_date, now() "
        "from marts.fct_field_production_monthly",
        "select cast(field_id as text), field_id::numeric(10, 2) from marts.dim_field",
        "select n from generate_series(1, 3) as g(n)",
        "select x from unnest(array[1, 2]) as u(x)",
    ],
)
def test_accepts_the_functions_analysis_needs(sql):
    assert check(sql).sql


def test_operators_modelled_as_functions_cannot_pose_as_allowed_names():
    # sqlglot models `count -> 'a'` as a function whose rendering starts with the operand
    with pytest.raises(UnsafeSQL, match="not allowed"):
        check("select count -> 'a' from (select '{}'::json as count) as t")


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
        "select * from stakeflow.marts.dim_field",  # database-qualified
        "select * from marts.no_such_table",
        "select * from no_such_table",
        'select * from marts."DIM_FIELD"',  # quoted upper case is a different table in Postgres
        "select * from dim_field",  # allow-listed, but must be schema-qualified
    ],
)
def test_rejects_tables_outside_the_allow_list(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


def test_reports_the_tables_used():
    guarded = check(
        "with f as (select field_id, name from marts.dim_field) "
        "select f.name, o.share_pct from f join marts.fct_field_ownership o using (field_id)"
    )
    assert guarded.tables == ["marts.dim_field", "marts.fct_field_ownership"]


def test_upper_case_unquoted_names_fold_like_postgres():
    assert check("SELECT NAME FROM MARTS.DIM_FIELD").tables == ["marts.dim_field"]


@pytest.mark.parametrize(
    "sql",
    [
        # A CTE inside a derived table does not hide the outer, unqualified catalog view
        "select * from (with pg_stat_activity as (select 1) select 1) a, pg_stat_activity",
        # Defined in one sibling subquery, used in another
        "select * from (with x as (select 1 as n) select n from x) a, (select n from x) b",
        # A scalar subquery's CTE is not visible to the outer FROM
        "select (with pg_roles as (select 1) select 1), * from pg_roles",
        # Without RECURSIVE a CTE only sees the CTEs listed before it
        "with a as (select * from pg_roles), pg_roles as (select 1) select * from a",
        # A CTE cannot see itself without RECURSIVE
        "with pg_roles as (select * from pg_roles) select * from pg_roles",
        # "Foo" (quoted) and foo (folds to lower case) are different names
        'with "Foo" as (select 1) select * from foo',
        'with "Foo" as (select 1) select * from Foo',
        'with foo as (select 1) select * from "Foo"',
        # Set operation branches: a CTE in one parenthesised branch is not visible in the other
        "(with x as (select 1 as n) select n from x) union all (select n from x)",
    ],
)
def test_cte_names_only_count_in_their_own_scope(sql):
    with pytest.raises(UnsafeSQL, match="Schema-qualify"):
        check(sql)


@pytest.mark.parametrize(
    ("sql", "tables"),
    [
        ("with pg_roles as (select 1 as x) select * from pg_roles", []),
        ('with "Foo" as (select 1) select * from "Foo"', []),
        ("with Foo as (select 1) select * from FOO", []),
        ('with Foo as (select 1) select * from "foo"', []),
        # A CTE named like an allow-listed table shadows it; the qualified name is the real one
        (
            "with dim_field as (select 1 as field_id) "
            "select * from dim_field join marts.dim_field using (field_id)",
            ["marts.dim_field"],
        ),
        # Nested CTEs shadow correctly, and outer CTEs are visible inside subqueries and CTEs
        (
            "with a as (select 1 as n) "
            "select * from (with a as (select 2 as n) select n from a) s, a",
            [],
        ),
        ("with a as (select 1 as n), b as (select n from a) select * from b", []),
        ("with a as (select 1 as n) select (select max(n) from a)", []),
        ("with a as (with b as (select 1 as n) select n from b) select * from a", []),
        (
            "with recursive r as (select 1 as n union all select n + 1 from r where n < 3) "
            "select * from r",
            [],
        ),
        ("with x as (select 1 as n) select n from x union all select n from x", []),
    ],
)
def test_visible_ctes_are_accepted(sql, tables):
    assert check(sql).tables == tables


MOCK_ASK = Path(__file__).parents[2] / "frontend" / "src" / "api" / "mock" / "ask.ts"


@pytest.mark.skipif(not MOCK_ASK.exists(), reason="frontend not checked out")
def test_the_frontend_preview_queries_still_validate():
    queries = re.findall(r"sql: `(.*?)`", MOCK_ASK.read_text(), re.S)
    assert len(queries) == 5
    allowed = {
        **ALLOWED,
        "marts": ALLOWED["marts"] | {"fct_company_field_production_monthly"},
    }
    for sql in queries:
        assert validate_sql(sql, allowed).tables


@pytest.mark.parametrize("sql", ["", "   ", ";", "select from where", "select 'unterminated"])
def test_rejects_empty_or_unparseable(sql):
    with pytest.raises(UnsafeSQL):
        check(sql)


def test_rejects_very_long_sql():
    with pytest.raises(UnsafeSQL, match="longer"):
        check("select 1 " + " " * 9000)
