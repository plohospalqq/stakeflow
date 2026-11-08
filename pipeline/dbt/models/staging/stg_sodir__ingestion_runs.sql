select run_id, layer, started_at, finished_at, row_count, expected_count
from {{ source('raw', 'ingestion_runs') }}
where finished_at is not null
