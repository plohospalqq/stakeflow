"""What the model may query: tables and columns of the allowed schemas, read from the catalog.

Descriptions are the dbt docs, persisted as Postgres comments (pipeline/dbt: persist_docs), so
the schema shown to the model and the allow-list the SQL guard enforces come from one place.
"""

from dataclasses import dataclass

from psycopg import Connection

from stakeflow_api.db import fetch_all

ALLOWED_SCHEMAS = ("marts", "ml")

# Shapes, not data: the model has no use for them and a single row is kilobytes of WKB
HIDDEN_TYPE_PREFIXES = ("geometry", "geography")

CATALOG_SQL = """
select n.nspname as schema_name,
       c.relname as table_name,
       obj_description(c.oid, 'pg_class') as table_comment,
       a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as column_type,
       col_description(c.oid, a.attnum) as column_comment
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
join pg_attribute as a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = any(%(schemas)s) and c.relkind in ('r', 'v', 'm', 'p')
order by n.nspname, c.relname, a.attnum
"""


@dataclass(frozen=True)
class Column:
    name: str
    type: str
    description: str


@dataclass(frozen=True)
class Table:
    schema: str
    name: str
    description: str
    columns: tuple[Column, ...]

    @property
    def qualified_name(self) -> str:
        return f"{self.schema}.{self.name}"


@dataclass(frozen=True)
class Catalog:
    tables: tuple[Table, ...]

    @property
    def allowed_tables(self) -> dict[str, frozenset[str]]:
        allowed: dict[str, set[str]] = {schema: set() for schema in ALLOWED_SCHEMAS}
        for table in self.tables:
            allowed[table.schema].add(table.name)
        return {schema: frozenset(names) for schema, names in allowed.items()}

    def describe(self) -> str:
        """Compact, deterministic text for the system prompt (same bytes → prompt cache hits)."""
        blocks = []
        for table in self.tables:
            lines = [f"{table.qualified_name}: {table.description}".rstrip(": ")]
            for column in table.columns:
                text = f"  {column.name} {column.type}"
                lines.append(f"{text}: {column.description}" if column.description else text)
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks)


def load_catalog(conn: Connection) -> Catalog:
    rows = fetch_all(conn, CATALOG_SQL, {"schemas": list(ALLOWED_SCHEMAS)})
    tables: dict[tuple[str, str], tuple[str, list[Column]]] = {}
    for row in rows:
        key = (row["schema_name"], row["table_name"])
        _, columns = tables.setdefault(key, (_clean(row["table_comment"]), []))
        if row["column_type"].startswith(HIDDEN_TYPE_PREFIXES):
            continue
        columns.append(
            Column(row["column_name"], row["column_type"], _clean(row["column_comment"]))
        )
    return Catalog(
        tuple(
            Table(schema, name, description, tuple(columns))
            for (schema, name), (description, columns) in tables.items()
        )
    )


def _clean(comment: str | None) -> str:
    return " ".join((comment or "").split())
