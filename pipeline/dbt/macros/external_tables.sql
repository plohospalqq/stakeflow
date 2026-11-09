{#-
    Tables written by Python (market loaders, ML assets), created here too so dbt builds on a
    database where those loaders have not run yet (CI, a fresh `make up`). Empty tables give
    empty marts, never a failed build. Same DDL as stakeflow_pipeline/market/store.py and
    stakeflow_pipeline/ml/schema.py; keep them in sync.
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

    {#- Same DDL as stakeflow_pipeline/ml/schema.py -#}
    create table if not exists ml.anomaly_runs (
        run_id           uuid        primary key,
        run_at           timestamptz not null default now(),
        model_version    text        not null,
        params           jsonb       not null,
        latest_month     date        not null,
        evaluated_from   date        not null,
        flagged_from     date        not null,
        fields_evaluated integer     not null,
        anomaly_count    integer     not null
    );
    create table if not exists ml.anomaly_evaluations (
        run_id          uuid             not null references ml.anomaly_runs (run_id),
        field_id        integer          not null,
        month           date             not null,
        actual_boe_d    double precision not null,
        expected_boe_d  double precision,
        lo_boe_d        double precision,
        hi_boe_d        double precision,
        sigma_log       double precision,
        pct_vs_expected double precision,
        seasonal        boolean          not null,
        is_anomaly      boolean          not null,
        severity        text,
        excluded_reason text,
        note            text,
        primary key (run_id, field_id, month)
    );
{% endmacro %}
