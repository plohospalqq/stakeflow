-- How long after month end Sodir's field-level data first appeared in our snapshots.
-- A month is measured only if an earlier snapshot did NOT contain it; the very first snapshot
-- holds old months whose real publication date we never saw. The true publication moment lies
-- between last_missing_at and first_seen_at, so the sensor's polling interval sets the precision.
with snapshots as (
    select distinct snapshot_at from {{ ref('stg_sodir__production_snapshots') }}
),

first_seen as (
    select month, min(snapshot_at) as first_seen_at
    from {{ ref('stg_sodir__production_snapshots') }}
    group by month
),

bounded as (
    select
        f.month,
        f.first_seen_at,
        (select max(s.snapshot_at) from snapshots as s where s.snapshot_at < f.first_seen_at)
            as last_missing_at,
        (f.month + interval '1 month')::date as month_end
    from first_seen as f
)

select
    month,
    last_missing_at,
    first_seen_at,
    last_missing_at::date - month_end as lag_days_min,
    first_seen_at::date - month_end as lag_days_max,
    last_missing_at is not null as is_measured
from bounded
