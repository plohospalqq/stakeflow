"""Validate model-written SQL before it gets anywhere near the database.

First of three layers (then the read-only `stakeflow_reader` role, then a statement timeout and
row cap). The rule is an allow-list wherever one is practical:

- exactly one statement, and it is a query (SELECT, WITH … SELECT, UNION …);
- no node anywhere in the tree that writes, changes the schema or the session (this also catches
  data-modifying CTEs such as `WITH d AS (DELETE …) SELECT …`), no SELECT INTO, no FOR UPDATE;
- tables only from the allowed schemas, and only tables the catalog lists there;
- no function on the deny-list, and no schema-qualified function calls.

What runs is sqlglot's own rendering of the parsed tree, not the model's text: comments are
dropped and unqualified tables get their schema, so a trick that hides something from the parser
cannot reach Postgres either.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

MAX_SQL_CHARS = 8_000

# sqlglot warns when it falls back to a raw Command (EXPLAIN, DO, …); those are rejected anyway
logging.getLogger("sqlglot").setLevel(logging.ERROR)

# Statements and clauses that write, change the schema or change the session.
FORBIDDEN_NODES: tuple[type[exp.Expr], ...] = (
    exp.DML,  # UPDATE, DELETE, MERGE, COPY
    exp.DDL,  # CREATE, INSERT
    exp.Drop,
    exp.Alter,
    exp.AlterColumn,
    exp.TruncateTable,
    exp.Command,  # anything sqlglot only recognises as raw text (EXPLAIN, VACUUM, DO, …)
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
    exp.Into,  # SELECT … INTO creates a table
    exp.Lock,  # FOR UPDATE / FOR SHARE
)

# Functions that sleep, read files, open connections, change settings, run SQL given as a
# string, signal other backends or touch large objects. The reader role cannot do most of these
# anyway; refusing them here gives the model a clear error instead of a Postgres one.
DENIED_FUNCTION_PREFIXES = ("pg_", "lo_", "dblink", "txid_")
DENIED_FUNCTIONS = frozenset(
    {
        "set_config",
        "current_setting",
        "query_to_xml",
        "query_to_xmlschema",
        "query_to_xml_and_xmlschema",
        "cursor_to_xml",
        "cursor_to_xmlschema",
        "table_to_xml",
        "table_to_xmlschema",
        "table_to_xml_and_xmlschema",
        "schema_to_xml",
        "schema_to_xmlschema",
        "schema_to_xml_and_xmlschema",
        "database_to_xml",
        "database_to_xmlschema",
        "database_to_xml_and_xmlschema",
        "ts_stat",  # runs the query passed in as text
        "crosstab",  # same (tablefunc)
        "loread",
        "lowrite",
        "nextval",
        "setval",
        "currval",
        "lastval",
        "inet_server_addr",
        "inet_server_port",
        "inet_client_addr",
        "inet_client_port",
    }
)


class UnsafeSQL(ValueError):
    """The SQL was rejected. The message is safe to show to the model and the user."""


@dataclass(frozen=True)
class GuardedSQL:
    sql: str  # what will run: rendered from the validated tree
    tables: list[str]  # schema-qualified, sorted, without CTE names


def validate_sql(sql: str, allowed_tables: Mapping[str, frozenset[str]]) -> GuardedSQL:
    """Check `sql` against the rules above and return the SQL to run.

    `allowed_tables` maps schema → table names, e.g. {"marts": frozenset({"dim_field", …})}.
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
    tables = _check_and_qualify_tables(tree, allowed_tables)

    rendered = tree.sql(dialect="postgres", pretty=True, comments=False)
    return GuardedSQL(sql=rendered, tables=tables)


def _check_functions(tree: exp.Expr) -> None:
    for node in tree.find_all(exp.Dot):
        if isinstance(node.expression, exp.Func):
            raise UnsafeSQL("Schema-qualified function calls are not allowed.")
    for func in tree.find_all(exp.Func):
        name = (func.name if isinstance(func, exp.Anonymous) else func.sql_name()).lower()
        if name in DENIED_FUNCTIONS or name.startswith(DENIED_FUNCTION_PREFIXES):
            raise UnsafeSQL(f"The function {name}() is not allowed.")


def _check_and_qualify_tables(
    tree: exp.Expr, allowed_tables: Mapping[str, frozenset[str]]
) -> list[str]:
    cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    schema_of = _unique_table_schemas(allowed_tables)
    used: set[str] = set()

    for table in tree.find_all(exp.Table):
        if not isinstance(table.this, exp.Identifier):
            continue  # a table function such as generate_series(); functions are checked above
        if table.catalog:
            raise UnsafeSQL("Database-qualified table names are not allowed.")
        name, schema = _ident(table, "this"), _ident(table, "db")

        if not schema:
            if name in cte_names:
                continue
            if name not in schema_of:
                raise UnsafeSQL(f"Unknown table {name!r}. Use the tables listed in the schema.")
            # Qualify it, so Postgres cannot resolve the name to pg_catalog or anything else
            schema = schema_of[name]
            table.set("db", exp.to_identifier(schema))
        elif schema not in allowed_tables:
            raise UnsafeSQL(f"The schema {schema!r} is not allowed.")
        elif name not in allowed_tables[schema]:
            raise UnsafeSQL(f"Unknown table {schema}.{name}. Use the tables listed in the schema.")
        used.add(f"{schema}.{name}")

    return sorted(used)


def _unique_table_schemas(allowed_tables: Mapping[str, frozenset[str]]) -> dict[str, str]:
    """Table name → schema, for names that exist in exactly one allowed schema."""
    seen: dict[str, list[str]] = {}
    for schema, tables in allowed_tables.items():
        for table in tables:
            seen.setdefault(table, []).append(schema)
    return {table: schemas[0] for table, schemas in seen.items() if len(schemas) == 1}


def _ident(table: exp.Table, part: str) -> str:
    """Identifier as Postgres resolves it: unquoted names fold to lower case."""
    node = table.args.get(part)
    if not isinstance(node, exp.Identifier):
        return ""
    return node.name if node.quoted else node.name.lower()


def _describe(node: exp.Expr) -> str:
    if isinstance(node, exp.Into):
        return "SELECT … INTO"
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
