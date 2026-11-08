{#- The newest complete snapshot of one Sodir layer: rows `a` (attributes jsonb) and `geometry`. -#}
{% macro latest_snapshot(layer) %}
    (
        select r.attributes as a, r.geometry
        from {{ source('raw', 'sodir_' ~ layer) }} as r
        where r.ingestion_run_id = (
            select run_id
            from {{ source('raw', 'ingestion_runs') }}
            where layer = '{{ layer }}' and finished_at is not null
            order by finished_at desc
            limit 1
        )
    )
{% endmacro %}

{#- Sodir dates are epoch milliseconds at UTC midnight -#}
{% macro epoch_ms_to_date(expr) %}
    (to_timestamp(({{ expr }})::bigint / 1000.0) at time zone 'UTC')::date
{% endmacro %}

{#- Sm³ oil equivalent → barrels of oil equivalent per day (1 Sm³ = 6.2898 bbl) -#}
{% macro boe_per_day(oe_sm3, days) %}
    ({{ oe_sm3 }} * 6.2898 / {{ days }})
{% endmacro %}
