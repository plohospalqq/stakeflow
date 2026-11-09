"""Scenario parsing: the parameter contract, the arithmetic done from data, clamping. No network.

The model is scripted; it only ever reports what the text said. Every number in the output is
computed by the parser from the (fake or real) marts and the reference levels.
"""

import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from stakeflow_api.deps import get_llm
from stakeflow_api.main import app
from stakeflow_api.routers.scenarios import get_scenario_data
from stakeflow_api.scenarios.data import FieldMatch, FieldShare
from stakeflow_api.scenarios.parser import (
    ScenarioNotUnderstood,
    ScenarioParseRequest,
    parse_scenario,
)
from tests.fakes import FakeAnthropic, last_tool_result, text_reply, tool_call

SVERDRUP = 26376286
CONTRACT = {
    "brent_change_pct",
    "ttf_change_pct",
    "production_change_pct",
    "eurusd_change_pct",
    "horizon_months",
    "assumptions",
    "company_id",
}


class FakeData:
    def companies(self):
        return {"aker-bp": "Aker BP", "equinor": "Equinor (NCS only)", "var-energi": "Vår Energi"}

    def find_fields(self, name):
        if "sverdrup" not in name.lower():
            return []
        owners = [("equinor", "Equinor (NCS only)", 42.63), ("aker-bp", "Aker BP", 31.57)]
        return [FieldMatch(SVERDRUP, "JOHAN SVERDRUP", "Producing", owners)]

    def field_name(self, field_id):
        return "JOHAN SVERDRUP" if field_id == SVERDRUP else None

    def field_shares(self, field_id):
        period = (date(2025, 9, 1), date(2026, 8, 1))
        return [
            FieldShare("aker-bp", field_id, 54.9, *period),
            FieldShare("equinor", field_id, 19.8, *period),
        ]


def driver(kind="none", value=None, quote=None):
    return {"kind": kind, "value": value, "quote": quote}


def submission(**overrides):
    base = {
        "company_id": None,
        "horizon_months": None,
        "brent": driver(),
        "ttf": driver(),
        "eurusd": driver(),
        "production": {"company_change_pct": None, "field_changes": [], "quote": None},
        "unsupported": [],
    }
    return {**base, **overrides}


def outage(months=2.0, change=-100):
    return {
        "company_change_pct": None,
        "field_changes": [
            {
                "field_id": SVERDRUP,
                "change_pct": change,
                "duration_months": months,
                "quote": "Johan Sverdrup stops for two months",
            }
        ],
        "quote": None,
    }


def parse(script, text="case", **request):
    client = FakeAnthropic(*script)
    result = parse_scenario(
        ScenarioParseRequest(text=text, **request), client=client, data=FakeData()
    )
    return result, client


EXAMPLE = "What if Johan Sverdrup stops for two months and oil goes to $90?"


def test_the_example_case_end_to_end():
    result, client = parse(
        [
            tool_call("lookup_field", {"name": "Johan Sverdrup"}),
            tool_call(
                "submit_scenario",
                submission(
                    brent=driver("target_level", 90, "oil goes to $90"), production=outage()
                ),
            ),
        ],
        EXAMPLE,
        company_id="aker-bp",
        reference={"brent_usd": 65},
    )

    assert set(result.model_dump()) == CONTRACT
    assert result.brent_change_pct == 38.5  # 90 / 65 - 1
    assert result.production_change_pct == -36.6  # 54.9% of output, 2 of 3 months
    assert result.ttf_change_pct == 0 and result.eurusd_change_pct == 0
    assert result.horizon_months == 3
    assert result.company_id == "aker-bp"
    text = " ".join(result.assumptions)
    assert "Johan Sverdrup was 54.9% of Aker BP's net production over Sep 2025-Aug 2026" in text
    assert "offline for 2 of 3 months is -36.6%" in text
    assert "Brent at $90/bbl against $65/bbl now is +38.5%" in text
    assert "No time span given" in text

    # The lookup gave the model ids and owners, nothing it has to compute with
    looked_up = json.loads(last_tool_result(client.calls[1])["content"])
    assert looked_up["matches"][0]["field_id"] == SVERDRUP
    assert looked_up["matches"][0]["current_owners"][0]["company_id"] == "equinor"


def test_request_shape_strict_tools_and_cached_company_list():
    _, client = parse([tool_call("submit_scenario", submission())])
    call = client.calls[0]
    assert [t["name"] for t in call["tools"]] == ["lookup_field", "submit_scenario"]
    assert all(t["strict"] for t in call["tools"])
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "aker-bp: Aker BP" in call["system"][0]["text"]
    assert call["messages"][0]["content"] == "<case>\ncase\n</case>"


def test_a_target_price_without_a_reference_level_stays_at_zero():
    result, _ = parse(
        [tool_call("submit_scenario", submission(brent=driver("target_level", 120, "$120 oil")))]
    )
    assert result.brent_change_pct == 0
    assert any("no current level was provided" in a for a in result.assumptions)


def test_stated_percent_changes_pass_through():
    result, _ = parse(
        [
            tool_call(
                "submit_scenario",
                submission(
                    horizon_months=12,
                    ttf=driver("change_pct", 100, "gas doubles"),
                    eurusd=driver("change_pct", -5, "euro weakens 5%"),
                    production={
                        "company_change_pct": -10,
                        "field_changes": [],
                        "quote": "production drops 10%",
                    },
                    company_id="var-energi",
                ),
            )
        ]
    )
    assert (result.ttf_change_pct, result.eurusd_change_pct) == (100, -5)
    assert result.production_change_pct == -10 and result.horizon_months == 12
    assert result.company_id == "var-energi"
    assert 'TTF gas +100% as stated ("gas doubles").' in result.assumptions


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("brent", 500, 300),
        ("brent", -95, -90),
        ("ttf", 400, 300),
        ("eurusd", -70, -50),
        ("eurusd", 150, 100),
    ],
)
def test_prices_are_clamped_and_explained(field, value, expected):
    result, _ = parse(
        [tool_call("submit_scenario", submission(**{field: driver("change_pct", value, "x")}))]
    )
    assert getattr(result, f"{field}_change_pct") == expected
    assert any("outside what the model supports" in a for a in result.assumptions)


def test_production_and_horizon_are_clamped():
    result, _ = parse(
        [
            tool_call(
                "submit_scenario",
                submission(
                    horizon_months=36,
                    company_id="aker-bp",
                    production={"company_change_pct": -150, "field_changes": [], "quote": None},
                ),
            )
        ]
    )
    assert result.production_change_pct == -100 and result.horizon_months == 24
    assert sum("outside what the model supports" in a for a in result.assumptions) == 2


def test_a_field_change_without_a_company_is_explained_not_guessed():
    result, _ = parse([tool_call("submit_scenario", submission(production=outage()))], EXAMPLE)
    assert result.production_change_pct == 0 and result.company_id is None
    [note] = [a for a in result.assumptions if "Johan Sverdrup" in a]
    assert "55% of Aker BP's" in note and "20% of Equinor (NCS only)'s" in note
    assert "pick a company" in note


def test_the_text_wins_over_the_selected_company_and_unknown_ids_are_ignored():
    result, _ = parse(
        [tool_call("submit_scenario", submission(company_id="equinor", production=outage(3)))],
        company_id="aker-bp",
    )
    assert result.company_id == "equinor" and result.production_change_pct == -19.8

    result, _ = parse(
        [tool_call("submit_scenario", submission(company_id="no-such-co"))], company_id="aker-bp"
    )
    assert result.company_id == "aker-bp"
    assert any("'no-such-co'" in a for a in result.assumptions)


def test_partial_field_change_for_the_whole_period():
    result, _ = parse(
        [tool_call("submit_scenario", submission(production=outage(months=None, change=-50)))],
        company_id="aker-bp",
    )
    assert result.production_change_pct == -27.4  # 54.9% x -50%, all 3 months (rounded)


def test_unsupported_items_and_empty_cases_are_said_plainly():
    result, _ = parse(
        [tool_call("submit_scenario", submission(horizon_months=6, unsupported=["interest rates"]))]
    )
    assert result.assumptions == ["Not part of the scenario model, so left out: interest rates."]

    result, _ = parse([tool_call("submit_scenario", submission(horizon_months=6))])
    assert result.assumptions == [
        "The text sets no prices or production changes, so nothing was changed."
    ]
    assert result.brent_change_pct == 0 and str(result.production_change_pct) == "0.0"


def test_gives_up_if_the_model_never_submits():
    with pytest.raises(ScenarioNotUnderstood):
        parse([text_reply("Hmm"), text_reply("Still hmm")])


def test_invalid_submission_is_sent_back_once():
    result, client = parse(
        [
            tool_call("submit_scenario", {"brent": "up"}),
            tool_call("submit_scenario", submission(horizon_months=6)),
        ]
    )
    assert last_tool_result(client.calls[1])["is_error"] is True
    assert result.horizon_months == 6


# Over HTTP, with fakes (no lifespan, so no database)


@pytest.fixture
def api():
    app.state.llm_client = None
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.state.llm_client = None


def test_503_without_an_api_key(api, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = api.post("/scenarios/parse", json={"text": EXAMPLE})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_not_configured"


def test_http_response_is_exactly_the_contract_in_snake_case(api):
    app.dependency_overrides[get_llm] = lambda: FakeAnthropic(
        tool_call("submit_scenario", submission(brent=driver("change_pct", 20, "oil +20%")))
    )
    app.dependency_overrides[get_scenario_data] = FakeData
    response = api.post("/scenarios/parse", json={"text": "Oil up 20%"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == CONTRACT
    assert body["brent_change_pct"] == 20 and body["horizon_months"] == 3


def test_422_when_the_text_cannot_be_parsed(api):
    app.dependency_overrides[get_llm] = lambda: FakeAnthropic(text_reply("?"), text_reply("?"))
    app.dependency_overrides[get_scenario_data] = FakeData
    response = api.post("/scenarios/parse", json={"text": "blah"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "not_understood"


@pytest.mark.parametrize(
    "body",
    [{"text": ""}, {"text": "x" * 1001}, {"text": "ok", "reference": {"brent_usd": -1}}],
)
def test_request_validation(api, body):
    app.dependency_overrides[get_llm] = lambda: FakeAnthropic()
    app.dependency_overrides[get_scenario_data] = FakeData
    assert api.post("/scenarios/parse", json=body).status_code == 422
