"""Ask the data: a plain-language question answered with one read-only query over the marts."""

from datetime import date
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends

from stakeflow_api.ask.service import AskContext, RunQuery, answer_question
from stakeflow_api.deps import get_ask_context, get_llm, get_query_runner, unavailable
from stakeflow_api.llm import LLMUnavailable, MessagesClient
from stakeflow_api.schemas import AskAnswer, AskRequest, AskTable

router = APIRouter(tags=["ask"])

# Declared in this order on purpose: without an API key the answer is 503 before anything
# touches the database
LLM = Annotated[MessagesClient, Depends(get_llm)]
Runner = Annotated[RunQuery, Depends(get_query_runner)]
Context = Annotated[AskContext, Depends(get_ask_context)]

UNAVAILABLE = {
    503: {
        "description": (
            "Ask is off or cannot run: no ANTHROPIC_API_KEY (code llm_not_configured), no "
            "reader role password (reader_not_configured), the model or database cannot be "
            "reached (llm_unavailable, reader_unavailable) or no data is loaded (no_data)."
        )
    }
}


@router.post("/ask", response_model=AskAnswer, response_model_by_alias=True, responses=UNAVAILABLE)
def ask(body: AskRequest, client: LLM, run_query: Runner, context: Context) -> AskAnswer:
    """Claude writes one read-only SQL query for the question, the API validates and runs it,
    and Claude explains the rows. Numbers in the answer come from the rows, never the model."""
    try:
        run = answer_question(
            body.question.strip(),
            client=client,
            context=context,
            run_query=run_query,
            today=date.today(),
        )
    except LLMUnavailable as exc:
        raise unavailable("llm_unavailable", str(exc)) from exc
    except psycopg.OperationalError as exc:
        raise unavailable(
            "reader_unavailable", "The read-only database role could not connect."
        ) from exc
    return run.answer


@router.get("/ask/tables", response_model=list[AskTable], response_model_by_alias=True)
def ask_tables(context: Context) -> list[AskTable]:
    """The tables Ask may query, with their descriptions (for the "Data you can ask about" list)."""
    return [
        AskTable(name=table.qualified_name, description=table.description)
        for table in context.catalog.tables
    ]
