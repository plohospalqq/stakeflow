with source as (
    select
        a,
        -- Some Sodir polygons self-intersect after reprojection; repair once, here
        case
            when geometry is not null
                then st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(geometry::text), 4326)), 3))
        end as geom
    from {{ latest_snapshot('field') }} as s
)

select
    (a->>'fldNpdidField')::int as field_id,
    a->>'fldName' as name,
    -- Sodir's column name really is misspelled ("Satus")
    a->>'fldCurrentActivitySatus' as status,
    a->>'fldHcType' as hc_type,
    a->>'fldMainArea' as main_area,
    (a->>'fldDiscoveryYear')::int as discovery_year,
    a->>'fldMainSupplyBase' as main_supply_base,
    (a->>'cmpNpdidCompany')::int as operator_company_id,
    a->>'fldFactPageUrl' as factpage_url,
    geom
from source
