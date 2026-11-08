{{ config(post_hook="create index if not exists dim_field_geom_idx on {{ this }} using gist (geom)") }}

with production_span as (
    select field_id, min(month) as first_production_month, max(month) as last_production_month
    from {{ ref('stg_sodir__production_monthly') }}
    where oil_sm3 + gas_sm3 + ngl_sm3 + condensate_sm3 > 0
    group by field_id
)

select
    f.field_id,
    f.name,
    f.status,
    f.hc_type,
    f.main_area,
    f.discovery_year,
    f.main_supply_base,
    f.operator_company_id,
    g.group_id as operator_group_id,
    f.factpage_url,
    p.first_production_month,
    p.last_production_month,
    round((st_area(f.geom::geography) / 1e6)::numeric, 2) as area_km2,
    st_pointonsurface(f.geom) as centroid,
    f.geom
from {{ ref('stg_sodir__fields') }} as f
left join {{ ref('int_company_groups') }} as g on g.company_id = f.operator_company_id
left join production_span as p on p.field_id = f.field_id
