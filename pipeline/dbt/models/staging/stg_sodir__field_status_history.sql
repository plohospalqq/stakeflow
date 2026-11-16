select
    (a->>'fldNpdidField')::int as field_id,
    a->>'fldStatus' as status,
    {{ epoch_ms_to_date("a->>'fldStatusFromDate'") }} as valid_from,
    coalesce({{ epoch_ms_to_date("a->>'fldStatusToDate'") }} + 1, date '9999-12-31') as valid_to
from {{ latest_snapshot('field_activity_status_hst') }} as s
