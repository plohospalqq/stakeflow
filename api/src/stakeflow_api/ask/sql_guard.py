"""Validate model-written SQL before it gets anywhere near the database.

First of three layers (then the read-only `stakeflow_reader` role, then a statement timeout and
row cap). The rule is an allow-list wherever one is practical:

- exactly one statement, and it is a query (SELECT, WITH ... SELECT, UNION ...);
- no node anywhere in the tree that writes, changes the schema or the session (this also catches
  data-modifying CTEs such as `WITH d AS (DELETE ...) SELECT ...`), no SELECT INTO, no FOR UPDATE;
- every table is schema-qualified to an allowed schema and listed in the catalog there, unless
  it names a CTE that is visible in that table's own scope. Postgres always searches pg_catalog
  first, so an unqualified name that is not a CTE could reach a catalog view;
- every function is on an allow-list (aggregates, window, maths, text, dates, casts), judged by
  the name Postgres will actually run. Anything unknown is refused, which covers the many
  functions that run SQL passed in as text (query_to_xml, ts_rewrite, crosstab, xpath_table...).

What runs is sqlglot's own rendering of the parsed tree, not the model's text: comments are
dropped, so a trick that hides something from the parser cannot reach Postgres either. Function
names are checked on that same rendering.
"""

import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

MAX_SQL_CHARS = 8_000

# sqlglot warns when it falls back to a raw Command (EXPLAIN, DO, ...); those are rejected anyway
logging.getLogger("sqlglot").setLevel(logging.ERROR)

# Statements and clauses that write, change the schema or change the session.
FORBIDDEN_NODES: tuple[type[exp.Expr], ...] = (
    exp.DML,  # UPDATE, DELETE, MERGE, COPY
    exp.DDL,  # CREATE, INSERT
    exp.Drop,
    exp.Alter,
    exp.AlterColumn,
    exp.TruncateTable,
    exp.Command,  # anything sqlglot only recognises as raw text (EXPLAIN, VACUUM, DO, ...)
    exp.Set,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Grant,
    exp.Revoke,
    exp.Comment,
    exp.Use,
    exp.Pragma,
    exp.LoadData,
    exp.Analyze,
    exp.Kill,
    exp.Describe,
    exp.Show,
    exp.Cache,
    exp.Uncache,
    exp.Refresh,
    exp.Into,  # SELECT ... INTO creates a table
    exp.Lock,  # FOR UPDATE / FOR SHARE
)

# Functions by the name Postgres will run (the name in sqlglot's rendering). Everything else is
# refused: an allow-list cannot miss a dangerous function the way a deny-list can.
ALLOWED_FUNCTIONS = frozenset(
    {
        # aggregates
        "count", "sum", "avg", "min", "max", "stddev", "stddev_pop", "stddev_samp", "variance",
        "var_pop", "var_samp", "string_agg", "array_agg", "bool_and", "bool_or", "every",
        "percentile_cont", "percentile_disc", "mode", "corr", "covar_pop", "covar_samp",
        "regr_slope", "regr_intercept", "regr_r2",
        # window
        "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead",
        "first_value", "last_value", "nth_value",
        # maths and rounding
        "abs", "round", "trunc", "floor", "ceil", "ceiling", "sign", "sqrt", "power", "exp",
        "ln", "log", "log10", "mod", "width_bucket",
        # conditionals and casts
        "coalesce", "nullif", "greatest", "least", "cast",
        # text
        "lower", "upper", "initcap", "length", "char_length", "substring", "substr", "left",
        "right", "trim", "btrim", "ltrim", "rtrim", "replace", "concat", "concat_ws",
        "split_part", "strpos", "position", "lpad", "rpad", "to_char", "to_number",
        # dates and times
        "date_trunc", "date_part", "extract", "make_date", "make_interval", "age", "to_date",
        "to_timestamp",
        # rows and arrays
        "generate_series", "unnest", "array_length", "cardinality",
    }
)  # fmt: skip

# Allowed constructs that sqlglot models as functions but that are keywords, not calls. Other
# operators it models as functions (JSON, array and regex operators, COLLATE) are refused: the
# marts need none of them.
KEYWORD_FUNCTIONS: tuple[type[exp.Expr], ...] = (
    exp.Connector,  # AND, OR, XOR
    exp.Case,
    exp.If,
    exp.CurrentDate,
    exp.CurrentTimestamp,
    exp.Array,
)

_CALL = re.compile(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\()?")


class UnsafeSQL(ValueError):
    """The SQL was rejected. The message is safe to show to the model and the user."""


@dataclass(frozen=True)
class GuardedSQL:
    sql: str  # what will run: rendered from the validated tree
    tables: list[str]  # schema-qualified, sorted, without CTE names


def validate_sql(sql: str, allowed_tables: Mapping[str, frozenset[str]]) -> GuardedSQL:
    """Check `sql` against the rules above and return the SQL to run.

    `allowed_tables` maps schema -> table names, e.g. {"marts": frozenset({"dim_field", ...})}.
    """
    if not sql or not sql.strip():
        raise UnsafeSQL("The query is empty.")
    if len(sql) > MAX_SQL_CHARS:
        raise UnsafeSQL(f"The query is longer than {MAX_SQL_CHARS} characters.")

    try:
        statements = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
    except (ParseError, TokenError) as exc:
        raise UnsafeSQL(f"The query could not be parsed: {_parse_error(exc)}") from exc

    if len(statements) != 1:
        raise UnsafeSQL(f"Send exactly one statement; found {len(statements)}.")
    tree = statements[0]
    if not isinstance(tree, exp.Select | exp.SetOperation):
        raise UnsafeSQL("Only SELECT queries (optionally starting with WITH) are allowed.")

    for node in tree.walk():
        if isinstance(node, FORBIDDEN_NODES):
            raise UnsafeSQL(f"{_describe(node)} is not allowed; the query must only read.")
    _check_functions(tree)
    tables = _check_tables(tree, allowed_tables)

    rendered = tree.sql(dialect="postgres", pretty=True, comments=False)
    return GuardedSQL(sql=rendered, tables=tables)


def _check_functions(tree: exp.Expr) -> None:
    for node in tree.find_all(exp.Dot):
        if isinstance(node.expression, exp.Func):
            raise UnsafeSQL("Schema-qualified function calls are not allowed.")
    for func in tree.find_all(exp.Func):
        if isinstance(func, KEYWORD_FUNCTIONS):
            continue
        # The name must be followed by "(": operators that sqlglot models as functions
        # (j -> 'a') render with an operand first, which must not pass as an allowed name
        rendered = func.sql(dialect="postgres")
        match = _CALL.match(rendered)
        if not match or not match.group(2):
            raise UnsafeSQL(
                f"The expression {rendered[:60]!r} is not allowed. Use plain comparisons, "
                "LIKE/ILIKE and standard functions."
            )
        name = match.group(1).lower()
        if name not in ALLOWED_FUNCTIONS:
            raise UnsafeSQL(
                f"The function {name}() is not allowed. Use standard aggregate, window, maths, "
                "text and date functions."
            )


def _check_tables(tree: exp.Expr, allowed_tables: Mapping[str, frozenset[str]]) -> list[str]:
    used: set[str] = set()
    for table in tree.find_all(exp.Table):
        if isinstance(table.this, exp.Func):
            # A table function such as generate_series(): the name is checked with the functions
            if table.args.get("db") or table.args.get("catalog"):
                raise UnsafeSQL("Schema-qualified function calls are not allowed.")
            continue
        if not isinstance(table.this, exp.Identifier):
            raise UnsafeSQL(f"Unsupported table reference {table.sql(dialect='postgres')!r}.")
        if table.args.get("catalog"):
            raise UnsafeSQL("Database-qualified table names are not allowed.")
        name, schema = _fold(table.this), _fold(table.args.get("db"))

        if not schema:
            if _visible_cte(table, name):
                continue
            raise UnsafeSQL(
                f"Unknown table {name!r}. Schema-qualify every table, e.g. marts.dim_field; "
                "only CTEs defined in the same query can be used without a schema."
            )
        if schema not in allowed_tables:
            raise UnsafeSQL(f"The schema {schema!r} is not allowed.")
        if name not in allowed_tables[schema]:
            raise UnsafeSQL(f"Unknown table {schema}.{name}. Use the tables listed in the schema.")
        used.add(f"{schema}.{name}")
    return sorted(used)


def _visible_cte(table: exp.Table, name: str) -> bool:
    """True if a CTE called `name` is in scope where `table` appears, as Postgres scopes it.

    Walk up from the table. A query's CTEs are visible in its body and in everything nested in
    it. Inside a CTE's own definition only the CTEs listed before it are visible (all of them,
    itself included, with RECURSIVE). A CTE defined inside a subquery is invisible outside it.
    """
    child: exp.Expr = table
    node = table.parent
    while node is not None:
        if isinstance(node, exp.With) and isinstance(child, exp.CTE):
            ctes = list(node.expressions)
            position = next(i for i, cte in enumerate(ctes) if cte is child)
            visible = ctes if node.args.get("recursive") else ctes[:position]
            if name in {_cte_name(cte) for cte in visible}:
                return True
        elif isinstance(node, exp.Query):
            # Found by type, not by arg name (sqlglot has called it both "with" and "with_")
            with_ = next((v for v in node.args.values() if isinstance(v, exp.With)), None)
            # Coming up through the WITH itself was handled above; this is the query body
            in_body = with_ is not None and child is not with_
            if in_body and name in {_cte_name(cte) for cte in with_.expressions}:
                return True
        child, node = node, node.parent
    return False


def _cte_name(cte: exp.Expr) -> str:
    alias = cte.args.get("alias")
    return _fold(alias.this) if isinstance(alias, exp.TableAlias) else ""


def _fold(identifier: object) -> str:
    """An identifier as Postgres resolves it: unquoted names fold to lower case."""
    if not isinstance(identifier, exp.Identifier):
        return ""
    return identifier.name if identifier.quoted else identifier.name.lower()


def _describe(node: exp.Expr) -> str:
    if isinstance(node, exp.Into):
        return "SELECT ... INTO"
    if isinstance(node, exp.Lock):
        return "FOR UPDATE / FOR SHARE"
    if isinstance(node, exp.Command):
        return f"The command {str(node.this).upper()}"
    return f"{node.key.upper()}"


def _parse_error(exc: ParseError | TokenError) -> str:
    if isinstance(exc, ParseError) and exc.errors:
        first = exc.errors[0]
        description = str(first.get("description", "")).split(" but got <Token")[0]
        return f"{description} near {first.get('highlight')!r} (line {first.get('line')})"
    return (str(exc).strip().splitlines() or [type(exc).__name__])[0][:300]
