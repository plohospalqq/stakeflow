"""What-if scenarios: turn a free-text case into the scenario model's parameters."""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg_pool import ConnectionPool

from stakeflow_api.deps import get_llm, unavailable
from stakeflow_api.llm import LLMUnavailable, MessagesClient
from stakeflow_api.scenarios.data import MartsScenarioData, ScenarioData
from stakeflow_api.scenarios.parser import (
    ScenarioNotUnderstood,
    ScenarioParameters,
    ScenarioParseRequest,
    parse_scenario,
)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def get_scenario_data(request: Request) -> Iterator[ScenarioData]:
    pool: ConnectionPool = request.app.state.pool
    try:
        with pool.connection() as conn:
            yield MartsScenarioData(conn)
    except psycopg.OperationalError as exc:
        raise unavailable("no_data", "The marts are not available; run the pipeline.") from exc


# The key check comes first: without it the endpoint answers 503 before using the database
LLM = Annotated[MessagesClient, Depends(get_llm)]
Data = Annotated[ScenarioData, Depends(get_scenario_data)]


@router.post(
    "/parse",
    response_model=ScenarioParameters,
    responses={
        422: {"description": "The text could not be turned into scenario parameters"},
        503: {"description": "No ANTHROPIC_API_KEY (llm_not_configured) or model unreachable"},
    },
)
def parse(body: ScenarioParseRequest, client: LLM, data: Data) -> ScenarioParameters:
    """Translate a what-if case ("What if Johan Sverdrup stops for two months and oil goes to
    $90?") into scenario parameters.

    Claude only reports what the text says; every number is computed here from the marts and the
    reference levels you send, range-checked and explained in `assumptions`. Snake_case on
    purpose: this is the scenario model's parameter contract.
    """
    try:
        return parse_scenario(body, client=client, data=data)
    except LLMUnavailable as exc:
        raise unavailable("llm_unavailable", str(exc)) from exc
    except ScenarioNotUnderstood as exc:
        raise HTTPException(
            status_code=422, detail={"code": "not_understood", "message": str(exc)}
        ) from exc
