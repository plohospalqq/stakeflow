-- What each anomaly means for each current owner: (actual − expected) × today's field share,
-- in kboe/d (negative = production lost). Current shares, so a field sold since then counts
-- for its new owner; the API says so.
with owners as (
    select field_id, group_id, sum(share_pct) as share_pct
    from {{ ref('fct_field_ownership') }}
    where is_current
    group by field_id, group_id
)

select
    a.anomaly_id,
    o.group_id,
    g.display_name as group_name,
    g.is_focus,
    o.share_pct,
    (a.actual_boe_d - a.expected_boe_d) * o.share_pct / 100 / 1000 as impact_kboe_d
from {{ ref('fct_anomalies') }} as a
inner join owners as o on o.field_id = a.field_id
inner join {{ ref('dim_company_group') }} as g on g.group_id = o.group_id
