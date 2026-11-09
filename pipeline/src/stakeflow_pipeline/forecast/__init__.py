"""Phase 2: Arps decline forecasts per field, quarterly company nowcasts, the prediction log.

arps.py         the decline curve and its robust fit
field_model.py  decline detection, seasonal factors, bootstrap ranges, 12-month backtest
nowcast.py      field forecasts x day-weighted shares → company kboe/d per quarter
predictions.py  the append-only prediction row and its hashes
store.py        `ml` schema DDL (append-only triggers), loading the marts
run.py          one run end to end (CLI: stakeflow-forecast)
export.py       public JSON proof per quarter (CLI: stakeflow-export-predictions)
"""
