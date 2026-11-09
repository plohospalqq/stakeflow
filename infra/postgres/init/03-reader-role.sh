#!/usr/bin/env bash
# Read-only role for SQL written by a language model (the API's POST /ask).
#
# Defence in depth: the API validates every query before running it, but this role is the
# backstop. It can log in and SELECT from marts/ml, nothing else: no writes (read-only by default
# and no write privileges), no other schemas, 3 s per statement.
#
# Idempotent. Runs on the first start of an empty volume (docker-entrypoint-initdb.d) and can be
# re-run on an existing database:
#   docker compose exec db /docker-entrypoint-initdb.d/03-reader-role.sh
# The password comes from STAKEFLOW_READER_PASSWORD; without it the role exists but cannot log in.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v db_name="$POSTGRES_DB" -v reader_password="${STAKEFLOW_READER_PASSWORD:-}" <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stakeflow_reader') THEN
        CREATE ROLE stakeflow_reader LOGIN;
    END IF;
END
$$;

ALTER ROLE stakeflow_reader
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 10;

-- Defaults for every login. The API sets them again per connection and rejects SET and
-- set_config() in generated SQL, so a query cannot lift them.
ALTER ROLE stakeflow_reader SET default_transaction_read_only = on;
ALTER ROLE stakeflow_reader SET statement_timeout = '3s';
ALTER ROLE stakeflow_reader SET lock_timeout = '1s';
ALTER ROLE stakeflow_reader SET idle_in_transaction_session_timeout = '10s';
-- Only the layers it may read; pg_catalog is still searched first, which is why the API also
-- requires every table to be schema-qualified
ALTER ROLE stakeflow_reader SET search_path = marts, ml;

GRANT CONNECT ON DATABASE :"db_name" TO stakeflow_reader;
GRANT USAGE ON SCHEMA marts, ml TO stakeflow_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA marts, ml TO stakeflow_reader;
-- dbt drops and recreates mart tables on every build: grant on future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA marts, ml GRANT SELECT ON TABLES TO stakeflow_reader;

-- Nothing in the other layers, and no CREATE anywhere (PUBLIC lost CREATE on public in PG15;
-- revoke anyway so an upgraded cluster is covered)
REVOKE ALL ON SCHEMA raw, staging FROM stakeflow_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

SELECT :'reader_password' <> '' AS has_reader_password \gset
\if :has_reader_password
    ALTER ROLE stakeflow_reader PASSWORD :'reader_password';
\else
    \echo 'STAKEFLOW_READER_PASSWORD is not set: password left unchanged (a new role cannot log in yet)'
\endif
SQL
