{#- Rows sharing the same partition must not overlap in [valid_from, valid_to) -#}
{% test no_overlapping_intervals(model, partition_by, from_column='valid_from', to_column='valid_to') %}
select a.*
from {{ model }} as a
inner join {{ model }} as b
    on {% for col in partition_by %}a.{{ col }} = b.{{ col }} and {% endfor %}
       a.{{ from_column }} < b.{{ to_column }}
   and b.{{ from_column }} < a.{{ to_column }}
   and (a.{{ from_column }}, a.{{ to_column }}) <> (b.{{ from_column }}, b.{{ to_column }})
{% endtest %}
