"""Turn a free-text what-if case into the scenario model's parameters.

The split of work follows CLAUDE.md ("an LLM may only translate a user's free-text case into
scenario parameters; it never produces the numbers itself"):

- Claude reads the text and reports what the user *said*: a percent change or a target level
  per price, which fields change and for how long, which company, the time span. It may look a
  field up (lookup_field) to find its id and owners. It does no arithmetic.
- This module does the arithmetic: target levels become percent changes against reference
  levels the caller supplies, field outages become a company-level production change using the
  field's share of the company's output from the marts, and every value is range-checked and
  clamped. Each step is written out in plain language in `assumptions`.

If something cannot be computed from data (no current Brent price given, no company chosen for
a field outage), the parameter stays at 0 and an assumption says why. Nothing is guessed.
"""

import json
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from stakeflow_api.llm import MessagesClient, create_message, first_tool_use, tool_result
from stakeflow_api.scenarios.data import FieldShare, ScenarioData

MAX_MODEL_CALLS = 6
DEFAULT_HORIZON_MONTHS = 3
HORIZON_RANGE = (1, 24)
LIMITS: dict[str, tuple[float, float]] = {
    "brent_change_pct": (-90, 300),
    "ttf_change_pct": (-90, 300),
    "production_change_pct": (-100, 100),
    "eurusd_change_pct": (-50, 100),
}
LABELS = {
    "brent_change_pct": "Brent",
    "ttf_change_pct": "TTF gas",
    "production_change_pct": "production",
    "eurusd_change_pct": "EUR/USD",
}


class ScenarioNotUnderstood(ValueError):
    """The model could not turn the text into scenario drivers."""


# Request and response: the parameter contract shared with the scenario model (snake_case)


class ReferenceLevels(BaseModel):
    """Today's levels, from the explorer's own price data. Needed to turn '$90' into a %."""

    brent_usd: float | None = Field(None, gt=0, description="Brent, USD per barrel")
    ttf_eur_mwh: float | None = Field(None, gt=0, description="TTF gas, EUR per MWh")
    eurusd: float | None = Field(None, gt=0, description="EUR/USD rate (USD per EUR)")


class ScenarioParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    company_id: str | None = Field(
        None, description="Company the user is looking at; used when the text names none"
    )
    reference: ReferenceLevels | None = None


class ScenarioParameters(BaseModel):
    brent_change_pct: float = 0
    ttf_change_pct: float = 0
    production_change_pct: float = 0
    eurusd_change_pct: float = 0
    horizon_months: int = DEFAULT_HORIZON_MONTHS
    assumptions: list[str]
    company_id: str | None


# What the model submits: drivers as stated, no derived numbers


class _Driver(BaseModel):
    kind: Literal["none", "change_pct", "target_level"]
    value: float | None
    quote: str | None


class _FieldChange(BaseModel):
    field_id: int
    change_pct: float
    duration_months: float | None
    quote: str | None


class _Production(BaseModel):
    company_change_pct: float | None
    field_changes: list[_FieldChange]
    quote: str | None


class _Submission(BaseModel):
    company_id: str | None
    horizon_months: float | None
    brent: _Driver
    ttf: _Driver
    eurusd: _Driver
    production: _Production
    unsupported: list[str]


SYSTEM_TEMPLATE = """\
You translate a user's what-if case into scenario drivers for Stakeflow's scenario explorer, \
which models how a Norwegian oil and gas company might be affected by changes in Brent oil \
price, TTF gas price, the EUR/USD exchange rate and production. It is a scenario tool, not a \
forecast.

Report only what the user stated. Never estimate, convert or calculate a number yourself: the \
system does every calculation from data and shows its working.

For each price (brent in USD per barrel, ttf in EUR per MWh, eurusd as USD per EUR):
- kind "change_pct" with the stated percent change ("oil falls 20%" → -20; "gas doubles" → \
100; "the euro weakens 5% against the dollar" → eurusd -5),
- kind "target_level" with the stated level ("oil goes to $90" → 90), or
- kind "none" when the text does not mention it.
Put the user's words in quote.

Production:
- company_change_pct for a stated change to the company's total output ("production drops 10%" \
→ -10).
- field_changes for named fields: change_pct -100 when a field stops, the stated percent \
otherwise, and duration_months when the text says how long (null if for the whole period). \
Call lookup_field first to get the field_id.

company_id: the id from the list below when the text names or clearly implies a company \
(a field alone does not imply one); otherwise null.
horizon_months: the time span if the text gives one ("next quarter" → 3, "a year" → 12, \
"two months" for an outage is a duration, not the horizon); otherwise null.
unsupported: anything in the text the model cannot represent (interest rates, taxes, share \
buybacks, …), in a few words each.

When you have everything, call submit_scenario.

Companies (company_id: name):
{companies}
"""

_NULLABLE_NUMBER = {"anyOf": [{"type": "number"}, {"type": "null"}]}
_NULLABLE_STRING = {"anyOf": [{"type": "string"}, {"type": "null"}]}
_DRIVER = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["none", "change_pct", "target_level"]},
        "value": {**_NULLABLE_NUMBER, "description": "The stated number; null for none."},
        "quote": {**_NULLABLE_STRING, "description": "The user's words for this driver."},
    },
    "required": ["kind", "value", "quote"],
    "additionalProperties": False,
}

LOOKUP_FIELD: dict[str, Any] = {
    "name": "lookup_field",
    "description": (
        "Find a field by name to get its field_id and current owners. Call it for every field "
        "the text mentions before submitting field changes."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"name": {"type": "string", "description": "Field name, e.g. 'Sverdrup'."}},
        "required": ["name"],
        "additionalProperties": False,
    },
}

SUBMIT_SCENARIO: dict[str, Any] = {
    "name": "submit_scenario",
    "description": "Submit the scenario drivers exactly as the user stated them.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "company_id": _NULLABLE_STRING,
            "horizon_months": _NULLABLE_NUMBER,
            "brent": _DRIVER,
            "ttf": _DRIVER,
            "eurusd": _DRIVER,
            "production": {
                "type": "object",
                "properties": {
                    "company_change_pct": _NULLABLE_NUMBER,
                    "field_changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "field_id": {"type": "integer"},
                                "change_pct": {"type": "number"},
                                "duration_months": _NULLABLE_NUMBER,
                                "quote": _NULLABLE_STRING,
                            },
                            "required": ["field_id", "change_pct", "duration_months", "quote"],
                            "additionalProperties": False,
                        },
                    },
                    "quote": _NULLABLE_STRING,
                },
                "required": ["company_change_pct", "field_changes", "quote"],
                "additionalProperties": False,
            },
            "unsupported": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "company_id",
            "horizon_months",
            "brent",
            "ttf",
            "eurusd",
            "production",
            "unsupported",
        ],
        "additionalProperties": False,
    },
}

TOOLS = (LOOKUP_FIELD, SUBMIT_SCENARIO)
NUDGE = "Please call lookup_field or submit_scenario."


def system_prompt(companies: dict[str, str]) -> str:
    listed = "\n".join(f"{group_id}: {name}" for group_id, name in companies.items())
    return SYSTEM_TEMPLATE.format(companies=listed)


def parse_scenario(
    request: ScenarioParseRequest, *, client: MessagesClient, data: ScenarioData
) -> ScenarioParameters:
    companies = data.companies()
    system = system_prompt(companies)
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": f"<case>\n{request.text.strip()}\n</case>"}
    ]
    nudged = False

    for _ in range(MAX_MODEL_CALLS):
        response = create_message(
            client, system=system, tools=TOOLS, messages=messages, purpose="scenario"
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            break
        messages.append({"role": "assistant", "content": response.content})

        tool_use = first_tool_use(response)
        if tool_use is None:
            if nudged:
                break
            nudged = True
            messages.append({"role": "user", "content": NUDGE})
            continue

        if tool_use.name == "submit_scenario":
            try:
                submission = _Submission.model_validate(tool_use.input)
            except ValidationError as exc:
                reply = tool_result(tool_use.id, f"Invalid input: {exc.errors()[0]}", is_error=True)
            else:
                return compute_parameters(submission, request, companies, data)
        elif tool_use.name == "lookup_field":
            reply = tool_result(tool_use.id, _lookup(data, str(tool_use.input.get("name", ""))))
        else:
            reply = tool_result(tool_use.id, f"Unknown tool {tool_use.name!r}.", is_error=True)
        messages.append({"role": "user", "content": [reply]})

    raise ScenarioNotUnderstood("The text could not be turned into scenario parameters.")


def _lookup(data: ScenarioData, name: str) -> str:
    matches = data.find_fields(name) if name.strip() else []
    if not matches:
        return json.dumps({"matches": [], "note": f"No field matches {name!r}."})
    return json.dumps(
        {
            "matches": [
                {
                    "field_id": m.field_id,
                    "name": m.name,
                    "status": m.status,
                    "current_owners": [
                        {"company_id": gid, "company": label, "share_of_field_pct": round(s, 2)}
                        for gid, label, s in m.owners
                    ],
                }
                for m in matches
            ]
        },
        ensure_ascii=False,
    )


@dataclass
class _Work:
    """Parameters being built, with the plain-language trail of how."""

    assumptions: list[str]

    def note(self, text: str) -> None:
        self.assumptions.append(text)


def compute_parameters(
    submission: _Submission,
    request: ScenarioParseRequest,
    companies: dict[str, str],
    data: ScenarioData,
) -> ScenarioParameters:
    work = _Work(assumptions=[])
    horizon = _horizon(submission.horizon_months, work)
    company_id = _company(submission.company_id, request.company_id, companies, work)
    reference = request.reference or ReferenceLevels()

    values = {
        "brent_change_pct": _price(
            "Brent", submission.brent, reference.brent_usd, "${:g}/bbl", work
        ),
        "ttf_change_pct": _price(
            "TTF gas", submission.ttf, reference.ttf_eur_mwh, "EUR {:g}/MWh", work
        ),
        "eurusd_change_pct": _price("EUR/USD", submission.eurusd, reference.eurusd, "{:g}", work),
        "production_change_pct": _production(
            submission.production, company_id, companies, horizon, data, work
        ),
    }
    for key, value in values.items():
        values[key] = _clamp(key, value, work)

    for item in submission.unsupported:
        if item.strip():
            work.note(f"Not part of the scenario model, so left out: {item.strip()}.")
    if not work.assumptions:
        work.note("The text sets no prices or production changes, so nothing was changed.")

    return ScenarioParameters(
        # + 0.0 turns -0.0 into 0.0
        **{key: round(value, 1) + 0.0 for key, value in values.items()},
        horizon_months=horizon,
        assumptions=work.assumptions,
        company_id=company_id,
    )


def _horizon(stated: float | None, work: _Work) -> int:
    if stated is None:
        work.note(f"No time span given, so the scenario covers {DEFAULT_HORIZON_MONTHS} months.")
        return DEFAULT_HORIZON_MONTHS
    low, high = HORIZON_RANGE
    months = round(stated)
    if not low <= months <= high:
        clamped = min(max(months, low), high)
        work.note(
            f"A time span of {stated:g} months is outside what the model supports "
            f"({low}-{high}); using {clamped}."
        )
        return clamped
    return months


def _company(
    submitted: str | None, from_request: str | None, companies: dict[str, str], work: _Work
) -> str | None:
    for candidate, source in ((submitted, "named in the text"), (from_request, "selected")):
        if candidate and candidate in companies:
            return candidate
        if candidate:
            work.note(f"Company {candidate!r} ({source}) is not in the data, so it was ignored.")
    return None


def _price(label: str, driver: Any, reference: float | None, fmt: str, work: _Work) -> float:
    said = f' ("{driver.quote.strip()}")' if driver.quote and driver.quote.strip() else ""
    if driver.kind == "none" or driver.value is None:
        return 0.0
    if driver.kind == "change_pct":
        work.note(f"{label} {driver.value:+g}% as stated{said}.")
        return float(driver.value)
    if reference is None:
        work.note(
            f"{label} at {fmt.format(driver.value)} was asked for{said}, but no current level "
            "was provided to compare it with, so the change is left at 0%. Set it by hand."
        )
        return 0.0
    change = (driver.value / reference - 1) * 100
    work.note(
        f"{label} at {fmt.format(driver.value)} against {fmt.format(reference)} now is "
        f"{change:+.1f}%{said}."
    )
    return change


def _production(
    production: _Production,
    company_id: str | None,
    companies: dict[str, str],
    horizon: int,
    data: ScenarioData,
    work: _Work,
) -> float:
    total = 0.0
    if production.company_change_pct is not None:
        total += production.company_change_pct
        said = f' ("{production.quote.strip()}")' if production.quote else ""
        work.note(f"Production {production.company_change_pct:+g}% as stated{said}.")

    for change in production.field_changes:
        name = _title(data.field_name(change.field_id) or "")
        if not name:
            work.note(f"Field id {change.field_id} is not in the data, so it was ignored.")
            continue
        shares = data.field_shares(change.field_id)
        if company_id is None:
            work.note(_pick_a_company(name, shares, companies))
            continue
        share = next((s for s in shares if s.group_id == company_id), None)
        if share is None:
            work.note(f"{name} gave {companies[company_id]} no production in the last year.")
            continue
        total += _field_effect(name, change, share, companies[company_id], horizon, work)
    return total


def _field_effect(
    name: str,
    change: _FieldChange,
    share: FieldShare,
    company: str,
    horizon: int,
    work: _Work,
) -> float:
    months = horizon if change.duration_months is None else min(change.duration_months, horizon)
    effect = share.share_pct * change.change_pct / 100 * months / horizon
    what = "offline" if change.change_pct <= -100 else f"at {change.change_pct:+g}%"
    period = f"{share.period_start:%b %Y}-{share.period_end:%b %Y}"
    work.note(
        f"{name} was {share.share_pct:.1f}% of {company}'s net production over {period} "
        f"(Sodir); {what} for {months:g} of {horizon} months is {effect:+.1f}% for the period."
    )
    return effect


def _pick_a_company(name: str, shares: list[FieldShare], companies: dict[str, str]) -> str:
    known = [s for s in sorted(shares, key=lambda s: -s.share_pct) if s.group_id in companies]
    if not known:
        return f"No company named, and {name} has no recent production to attribute; left at 0%."
    parts = ", ".join(f"{s.share_pct:.0f}% of {companies[s.group_id]}'s" for s in known[:3])
    return (
        f"A change at {name} depends on whose output you look at: it is {parts} net production. "
        "No company was named or selected, so production is left at 0%; pick a company."
    )


def _clamp(key: str, value: float, work: _Work) -> float:
    low, high = LIMITS[key]
    if low <= value <= high:
        return value
    clamped = min(max(value, low), high)
    work.note(
        f"A {LABELS[key]} change of {value:+.1f}% is outside what the model supports "
        f"({low:+g}% to {high:+g}%); using {clamped:+g}%."
    )
    return clamped


def _title(name: str) -> str:
    """'JOHAN SVERDRUP' → 'Johan Sverdrup' for prose."""
    return " ".join(word.capitalize() for word in name.split())
