{#- Consecutive dates (per partition) must be at most max_days apart: catches a source that silently stopped or lost a stretch of history -#}
{% test max_gap_days(model, column_name, max_days, partition_by=none) %}
with ordered as (
    select
        {{ column_name }} as d,
        lag({{ column_name }}) over (
            {% if partition_by %}partition by {{ partition_by | join(', ') }}{% endif %}
            order by {{ column_name }}
        ) as previous_d
    from {{ model }}
)

select previous_d, d, d - previous_d as gap_days
from ordered
where d - previous_d > {{ max_days }}
{% endtest %}
