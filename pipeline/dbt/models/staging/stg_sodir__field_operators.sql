select
    (a->>'fldNpdidField')::int as field_id,
    (a->>'cmpNpdidCompany')::int as company_id,
    {{ epoch_ms_to_date("a->>'fldOperatorFrom'") }} as valid_from,
    coalesce({{ epoch_ms_to_date("a->>'fldOperatorTo'") }} + 1, date '9999-12-31') as valid_to
from {{ latest_snapshot('field_operator_hst') }} as s
