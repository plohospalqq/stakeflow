-- Runs once, on first start of an empty database volume.
-- One schema per layer so ownership and permissions stay obvious:
--   raw     = Sodir payloads exactly as received, append-only per ingestion run
--   staging = typed, cleaned, latest snapshot (dbt)
--   marts   = what the API reads (dbt)
--   ml      = reserved for forecasts / predictions in later phases

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS marts;
CREATE SCHEMA IF NOT EXISTS ml;
