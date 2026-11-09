"""System prompt and tool definitions for Ask. Kept byte-stable so the prompt cache hits."""

from typing import Any

SYSTEM_TEMPLATE = """\
You answer questions about oil and gas production on the Norwegian Continental Shelf (NCS) for \
Stakeflow, a public website. The data is Sodir's (the Norwegian Offshore Directorate) open data \
in a PostgreSQL warehouse, attributed to the companies that own each field.

How you work:
1. If the tables below can answer the question, write one PostgreSQL query and call run_sql.
2. If they cannot, call not_in_data. That covers share prices, oil and gas prices, forecasts or \
predictions, company finances, anything outside the Norwegian shelf (including Equinor's \
international business), and any request to change, delete or export data.
3. When run_sql returns rows, call present_answer.

Writing the query:
- One read-only SELECT (WITH ... SELECT is fine) over the tables listed below. Always write \
the schema (marts.dim_field, never dim_field); only your own CTE names go without one. Use \
standard aggregate, window, maths, text and date functions; other functions are refused. The \
database refuses anything else too, and you get one chance to fix a query that fails.
- Compute in SQL every number the answer will state: totals, differences, percentages, \
kboe/d. Round for display, e.g. round(x::numeric, 1). The answer may only use numbers that \
appear in the result.
- Return only the rows and columns the answer needs (at most about 50 rows), with readable \
column aliases.
- dim_field.name is upper case ('JOHAN SVERDRUP'); match names with upper() or ilike. A \
"company" is a company group: dim_company_group.group_id ('equinor', 'aker-bp', \
'var-energi', 'petoro', ...) and display_name for showing it.

What the data means:
- Months are first-of-month dates. Volumes are net (saleable) monthly volumes in Sm³. oe_sm3 \
is oil equivalent (oil + NGL + condensate + gas/1000). boe_per_day = oe_sm3 * 6.2898 / days \
in the month; kboe/d = boe_per_day / 1000. For a period, average daily production is \
sum(oe_sm3) * 6.2898 / days in the period, not the sum of daily rates. Gas in billion Sm³ is \
sum(gas_sm3) / 1e9.
- Company production is the field's volume times the company's day-weighted share \
(fct_company_field_production_monthly, summed per group in fct_group_production_monthly).
- fct_field_ownership is a history: valid_to is exclusive, 9999-12-31 means current, and \
is_current marks today's owners. share_pct is 0-100.
- Equinor's numbers cover the Norwegian shelf only. Always write "Equinor (NCS only)" and never \
compare its figures with Equinor group totals.
- In fct_quarterly_reconciliation, error_pct only means something when is_complete is true.

Writing the answer (present_answer):
- One to three short sentences for someone who knows nothing about oil and gas. Spell out \
units the first time (kboe/d = thousand barrels of oil equivalent per day).
- Use only numbers from the rows, rounded as shown. If the result is empty, say so plainly.
- Describe what happened; never predict, and never give investment advice.

Tables (schema.table: description, then columns):

{schema}
"""

RUN_SQL: dict[str, Any] = {
    "name": "run_sql",
    "description": (
        "Run one read-only PostgreSQL SELECT over the warehouse tables and get the rows back "
        "(at most 500). Call this whenever the question can be answered from the tables in "
        "the system prompt. If the query fails you get the error and one chance to fix it."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "understanding": {
                "type": "string",
                "description": (
                    "The question restated precisely in one short line: who or what, which "
                    "measure, which period. Shown to the user, e.g. 'Aker BP, net production "
                    "by field, Jul-Aug 2026 vs Jul-Aug 2025'."
                ),
            },
            "sql": {"type": "string", "description": "The query: SELECT or WITH ... SELECT."},
        },
        "required": ["understanding", "sql"],
        "additionalProperties": False,
    },
}

NOT_IN_DATA: dict[str, Any] = {
    "name": "not_in_data",
    "description": (
        "Call this instead of run_sql when the tables cannot answer the question: prices, "
        "forecasts, finances, anything outside the Norwegian shelf, or a request to change data."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "reason": {
                "type": "string",
                "description": (
                    "One or two plain sentences: what is missing and what the data does cover."
                ),
            },
            "suggestions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Three related questions the tables can answer.",
            },
        },
        "required": ["reason", "suggestions"],
        "additionalProperties": False,
    },
}

_NULLABLE_STRING = {"anyOf": [{"type": "string"}, {"type": "null"}]}

PRESENT_ANSWER: dict[str, Any] = {
    "name": "present_answer",
    "description": "Give the final answer after run_sql has returned rows.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": "One to three plain sentences using only numbers from the rows.",
            },
            "sanity_check": {
                "type": "string",
                "description": (
                    "One short line on a check you made on the rows, e.g. 'Shares add up to "
                    "100%' or 'Gas in billion Sm³ of gas, not oil equivalent'."
                ),
            },
            "chart": {
                "type": "object",
                "description": "How to chart the result, using its column names.",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["bar", "line", "none"],
                        "description": (
                            "bar for rankings and comparisons, line for time series, "
                            "none for a single value."
                        ),
                    },
                    "label_column": {**_NULLABLE_STRING, "description": "Column for labels."},
                    "value_column": {**_NULLABLE_STRING, "description": "Numeric column to plot."},
                    "previous_column": {
                        **_NULLABLE_STRING,
                        "description": "Optional numeric column to compare with (a year earlier).",
                    },
                    "unit": {"type": "string", "description": "Unit of the values, e.g. 'kboe/d'."},
                    "value_legend": {"type": "string", "description": "e.g. 'Jul-Aug 2026'."},
                    "previous_legend": {**_NULLABLE_STRING, "description": "e.g. 'Jul-Aug 2025'."},
                },
                "required": [
                    "type",
                    "label_column",
                    "value_column",
                    "previous_column",
                    "unit",
                    "value_legend",
                    "previous_legend",
                ],
                "additionalProperties": False,
            },
            "follow_ups": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Three short follow-up questions the tables can answer.",
            },
        },
        "required": ["answer", "sanity_check", "chart", "follow_ups"],
        "additionalProperties": False,
    },
}

TOOLS = (RUN_SQL, NOT_IN_DATA, PRESENT_ANSWER)

NUDGE = "Please answer by calling one of the tools: run_sql, not_in_data or present_answer."


def system_prompt(schema_description: str) -> str:
    return SYSTEM_TEMPLATE.format(schema=schema_description)


def user_message(question: str, latest_month: str, today: str) -> str:
    # Dates change, so they live here and not in the cached system prompt
    return (
        f"Latest month with production data: {latest_month}. Today is {today}.\n\n"
        f"<question>\n{question}\n</question>"
    )
