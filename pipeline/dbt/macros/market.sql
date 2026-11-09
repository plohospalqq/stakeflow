{#-
    Newest known value per (series, date) across all market runs of one raw table.
    Runs append windows of observations; a later run wins, so revisions replace old values.
-#}
{% macro latest_market_values(table) %}
    (
        select distinct on (r.attributes->>'series', r.attributes->>'date')
            r.attributes->>'series' as series,
            (r.attributes->>'date')::date as date,
            (r.attributes->>'value')::numeric as value,
            r.attributes->>'unit' as unit,
            r.attributes as a,
            runs.finished_at as loaded_at
        from {{ source('raw', table) }} as r
        inner join {{ source('raw', 'market_ingestion_runs') }} as runs
            on runs.run_id = r.ingestion_run_id
        where runs.finished_at is not null
        order by r.attributes->>'series', r.attributes->>'date', runs.finished_at desc
    )
{% endmacro %}

{#- 1 MMBtu = 1.05505585 GJ = 0.29307107 MWh (International Table Btu) -#}
{% macro usd_mmbtu_to_eur_mwh(usd_mmbtu, eurusd) %}
    ({{ usd_mmbtu }} / 0.29307107 / {{ eurusd }})
{% endmacro %}
