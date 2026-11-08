-- While a field has owners, every producing month must be 100% owned.
-- Known, reported (not hidden) exceptions via ownership_coverage_pct:
--   * months before the first ownership record (5 old fields, ~1.7 million Sm³ o.e. in total)
--   * the partial month in which ownership starts or ends
--   * tiny tail volumes reported after a field's licence ended (VALE 2023, FLYNDRE 2026)
with owned_span as (
    select field_id, min(valid_from) as first_valid_from, max(valid_to) as last_valid_to
    from {{ ref('fct_field_ownership') }}
    group by field_id
)

select p.field_id, p.month, p.ownership_coverage_pct
from {{ ref('fct_field_production_monthly') }} as p
inner join owned_span as s on s.field_id = p.field_id
where p.month > date_trunc('month', s.first_valid_from)
  and p.month < date_trunc('month', s.last_valid_to)
  and p.oe_sm3 > 0
  and abs(p.ownership_coverage_pct - 100) > 0.01
