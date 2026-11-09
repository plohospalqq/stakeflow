"""POST /ask over HTTP with the model, database and catalog replaced by fakes. No network, no DB.

The app is used without its lifespan, so there is no connection pool: a test that reached the
database by mistake would fail rather than pass quietly.
"""

import re
from pathlib import Path

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient

from stakeflow_api.deps import get_ask_context, get_llm, get_query_runner
from stakeflow_api.main import app
from tests.fakes import FakeAnthropic, tool_call
from tests.test_ask_service import CONTEXT, GAS_ROWS, PRESENT_GAS, RUN_GAS, FakeDB

FRONTEND_TYPES = Path(__file__).parents[2] / "frontend" / "src" / "api" / "types.ts"


@pytest.fixture
def api():
    app.state.llm_client = None
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.state.llm_client = None


def use_fakes(client: FakeAnthropic, db: FakeDB) -> None:
    app.dependency_overrides[get_llm] = lambda: client
    app.dependency_overrides[get_query_runner] = lambda: db
    app.dependency_overrides[get_ask_context] = lambda: CONTEXT


def test_503_with_a_clear_error_when_no_api_key(api, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = api.post("/ask", json={"question": "Top 10 gas fields in 2025"})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "llm_not_configured"
    assert "ANTHROPIC_API_KEY" in detail["message"]


def test_blank_api_key_counts_as_missing(api, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "  ")
    response = api.post("/ask", json={"question": "Top 10 gas fields in 2025"})
    assert response.status_code == 503


def test_503_when_the_reader_role_has_no_password(api, monkeypatch):
    monkeypatch.delenv("STAKEFLOW_READER_PASSWORD", raising=False)
    app.dependency_overrides[get_llm] = lambda: FakeAnthropic()
    response = api.post("/ask", json={"question": "Top 10 gas fields in 2025"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "reader_not_configured"


def test_503_when_the_model_cannot_be_reached(api):
    def unreachable(_request):
        raise anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        )

    use_fakes(FakeAnthropic(unreachable), FakeDB())
    response = api.post("/ask", json={"question": "Top 10 gas fields in 2025"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_unavailable"


@pytest.mark.parametrize("question", ["", "x" * 501])
def test_rejects_empty_or_huge_questions(api, question):
    use_fakes(FakeAnthropic(), FakeDB())
    assert api.post("/ask", json={"question": question}).status_code == 422


def test_response_is_camel_case_and_matches_the_frontend_type(api):
    use_fakes(
        FakeAnthropic(tool_call("run_sql", RUN_GAS), tool_call("present_answer", PRESENT_GAS)),
        FakeDB(GAS_ROWS),
    )
    response = api.post("/ask", json={"question": "Top 3 gas fields in 2025"})
    assert response.status_code == 200
    body = response.json()

    assert body["matched"] is True
    assert body["durationMs"] == 4
    assert body["followUps"] == PRESENT_GAS["follow_ups"][:3]
    assert body["chartLegend"] == {"current": "2025", "previous": None}
    assert body["chart"][0] == {"label": "TROLL", "value": 41.0, "previous": None}
    assert body["rows"][0] == ["TROLL", 41.0]
    assert body["steps"][2] == {"label": "Ran query", "detail": "4 ms · 3 rows"}
    assert body["chartType"] == "bar" and body["truncated"] is False

    if FRONTEND_TYPES.exists():  # contract check against frontend/src/api/types.ts
        assert ask_answer_fields() <= body.keys()


def ask_answer_fields() -> set[str]:
    source = FRONTEND_TYPES.read_text()
    block = re.search(r"export interface AskAnswer \{(.*?)\n\}", source, re.S)
    assert block, "AskAnswer is no longer in frontend/src/api/types.ts"
    return set(re.findall(r"^\s+(\w+)\??:", block.group(1), re.M))
