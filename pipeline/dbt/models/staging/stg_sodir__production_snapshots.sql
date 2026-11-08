-- Which months each complete profiles snapshot contained. Feeds fct_publication_lag.
select distinct
    r.ingestion_run_id,
    runs.finished_at as snapshot_at,
    make_date((r.attributes->>'prfYear')::int, (r.attributes->>'prfMonth')::int, 1) as month
from {{ source('raw', 'sodir_profiles') }} as r
inner join {{ ref('stg_sodir__ingestion_runs') }} as runs
    on runs.run_id = r.ingestion_run_id
where r.attributes->>'prfPeriod' = 'month'
  and r.attributes->>'prfInformationCarrierKind' = 'FIELD'
  and (r.attributes->>'prfYear')::int >= extract(year from runs.finished_at) - 1
