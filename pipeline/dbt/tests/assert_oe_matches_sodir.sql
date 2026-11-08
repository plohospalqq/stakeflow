-- Our oil-equivalent formula must reproduce Sodir's own o.e. column.
-- Tolerance: 0.1% or 10 Sm³ (Sodir rounds to 1e-6 million Sm³ per product).
select field_id, month, oe_sm3, oe_sm3_sodir
from {{ ref('fct_field_production_monthly') }}
where abs(oe_sm3 - oe_sm3_sodir) > greatest(0.001 * oe_sm3_sodir, 10)
