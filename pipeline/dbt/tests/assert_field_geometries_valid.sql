select field_id, name
from {{ ref('dim_field') }}
where geom is not null and not st_isvalid(geom)
