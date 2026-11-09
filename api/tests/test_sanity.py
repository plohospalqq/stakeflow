"""Tracing the numbers in an answer back to the query result."""

from stakeflow_api.ask.sanity import trace_numbers

MINUS, EN_DASH, NARROW_NBSP = chr(0x2212), chr(0x2013), chr(0x202F)

ROWS = [
    ["Johan Sverdrup", 195.912, 232.61, -36.698],
    ["Valhall", 29.4, 37.4, -8.0],
    ["2025-07-01", 383612.5, 0.463, 41000000000.0],
]


def test_rounded_numbers_from_the_rows_are_traced():
    trace = trace_numbers("Sverdrup fell 36.7 kboe/d to 195.9, from 232.6.", ROWS, "")
    assert trace.ok and trace.checked == 3


def test_signs_written_as_words_or_unicode_minus_are_fine():
    assert trace_numbers(f"Down {MINUS}36.7 ({EN_DASH}8.0 at Valhall).", ROWS, "").ok


def test_unit_scaling_and_percent_of_a_fraction():
    answer = "About 383.6 thousand boe/d, 383,612 boe/d or 0.38 million; 46.3% owned; 41 bn Sm³."
    trace = trace_numbers(answer, ROWS, "")
    assert trace.ok, trace.untraced


def test_thousands_separators_including_thin_spaces():
    assert trace_numbers("383 612 boe/d", ROWS, "").ok
    assert trace_numbers(f"383{NARROW_NBSP}612 boe/d", ROWS, "").ok


def test_made_up_numbers_are_reported():
    trace = trace_numbers("Sverdrup fell 36.7, which is 15.8% of its output.", ROWS, "")
    assert trace.untraced == ["15.8"] and trace.checked == 2


def test_rounding_tolerance_follows_the_shown_precision():
    assert trace_numbers("195.9", ROWS, "").ok
    assert not trace_numbers("195.7", ROWS, "").ok
    assert trace_numbers("196", ROWS, "").ok


def test_years_from_dates_and_the_question_and_small_counts_are_not_flagged():
    trace = trace_numbers(
        "In July 2025 the top 10 fields included 3 operated by Aker BP; in 2024 it was 2.",
        ROWS,
        "Top 10 fields in 2024",
    )
    assert trace.ok


def test_codes_inside_words_are_not_numbers():
    assert trace_numbers("Q2 output at Field-A3 and Tyrving", ROWS, "").checked == 0
