-- One row the API serves as "Sodir · through <latest_month>, refreshed <last_refresh_at>"
select
    (select max(month) from {{ ref('fct_field_production_monthly') }}) as latest_month,
    (select max(finished_at) from {{ ref('stg_sodir__ingestion_runs') }}) as last_refresh_at
