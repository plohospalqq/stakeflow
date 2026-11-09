{#-
    Tables written by Python (market loaders, ML assets), created here too so dbt builds on a
    database where those loaders have not run yet (CI, a fresh `make up`). Empty tables give
    empty marts, never a failed build. Same DDL as stakeflow_pipeline/market/store.py; keep in sync.
-#}
{% macro create_external_tables() %}
    create table if not exists raw.market_ingestion_runs (
        run_id         uuid        primary key,
        source         text        not null,
        origin         text        not null,
        window_start   date,
        content_sha256 text        not null,
        started_at     timestamptz not null default now(),
        finished_at    timestamptz,
        row_count      integer     not null
    );
    {% for table in ['market_eia_brent', 'market_ecb_fx', 'market_worldbank_pink_sheet', 'market_share_prices'] %}
    create table if not exists raw.{{ table }} (
        ingestion_run_id uuid        not null references raw.market_ingestion_runs (run_id),
        ingested_at      timestamptz not null default now(),
        attributes       jsonb       not null
    );
    create index if not exists {{ table }}_run_idx on raw.{{ table }} (ingestion_run_id);
    {% endfor %}
{% endmacro %}
