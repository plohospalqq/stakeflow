-- Monthly net (saleable) production per field, converted to plain Sm³.
-- Sodir publishes liquids in million Sm³ and gas in billion Sm³.
select
    (a->>'prfNpdidInformationCarrier')::int as field_id,
    make_date((a->>'prfYear')::int, (a->>'prfMonth')::int, 1) as month,
    coalesce((a->>'prfPrdOilNetMillSm3')::numeric, 0) * 1e6 as oil_sm3,
    coalesce((a->>'prfPrdGasNetBillSm3')::numeric, 0) * 1e9 as gas_sm3,
    coalesce((a->>'prfPrdNGLNetMillSm3')::numeric, 0) * 1e6 as ngl_sm3,
    coalesce((a->>'prfPrdCondensateNetMillSm3')::numeric, 0) * 1e6 as condensate_sm3,
    coalesce((a->>'prfPrdOeNetMillSm3')::numeric, 0) * 1e6 as oe_sm3_sodir,
    coalesce((a->>'prfPrdProducedWaterInFieldMillS')::numeric, 0) * 1e6 as produced_water_sm3
from {{ latest_snapshot('profiles') }} as s
where a->>'prfPeriod' = 'month'
  and a->>'prfInformationCarrierKind' = 'FIELD'
