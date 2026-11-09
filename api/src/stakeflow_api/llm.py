"""The one place the API talks to Claude: client setup, request defaults and error mapping.

Everything that calls the model goes through `create_message`, so the model, effort, caching and
refusal fallback are configured once. Prompts and replies are never logged (a question can
contain anything); only metadata such as token counts and the request id.
"""

import logging
import os
from collections.abc import Iterable, Sequence
from typing import Any, Protocol

import anthropic
from anthropic.types.beta import BetaMessage

log = logging.getLogger(__name__)

# Opus 5.5: the strongest model for writing correct SQL over an unfamiliar schema and for
# picking apart a free-text scenario. Override per environment if cost matters more.
MODEL = os.environ.get("STAKEFLOW_LLM_MODEL", "claude-opus-5-5")
# Thinking is always on for Opus 5.5; effort is the dial (its default is medium, set explicitly
# so a default change upstream does not silently change cost or quality)
EFFORT = os.environ.get("STAKEFLOW_LLM_EFFORT", "medium")
# Thinking counts towards max_tokens, so leave room beyond the short tool calls we expect
MAX_TOKENS = 16_000
# If a safety classifier declines a request, retry server-side on the model Anthropic picks
# for that refusal category instead of failing the user's question
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMNotConfigured(RuntimeError):
    """No API key: the LLM features are off and the UI keeps its preview."""


class LLMUnavailable(RuntimeError):
    """The model could not be reached or rejected the request; nothing the user can fix."""


class MessagesClient(Protocol):
    """The slice of `anthropic.Anthropic` we use; tests pass a fake with the same shape."""

    @property
    def beta(self) -> Any: ...


def make_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise LLMNotConfigured("ANTHROPIC_API_KEY is not set, so the LLM features are off.")
    return anthropic.Anthropic(api_key=api_key, timeout=60.0, max_retries=2)


def create_message(
    client: MessagesClient,
    *,
    system: str,
    tools: Sequence[dict[str, Any]],
    messages: Iterable[dict[str, Any]],
    purpose: str,
) -> BetaMessage:
    """One model turn. `system` and `tools` must be byte-stable across calls to hit the cache."""
    try:
        response: BetaMessage = client.beta.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            # Tools render before the system prompt, so this breakpoint caches both
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            tools=list(tools),
            # Opus 5.5 rejects forced tool use; the prompts ask for a tool and the caller
            # checks one came back. One call per turn keeps the workflow linear.
            tool_choice={"type": "auto", "disable_parallel_tool_use": True},
            messages=list(messages),
            output_config={"effort": EFFORT},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
    except anthropic.AuthenticationError as exc:
        raise LLMUnavailable("The Anthropic API key was rejected.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise LLMUnavailable("The Anthropic API key may not use this model.") from exc
    except anthropic.RateLimitError as exc:
        raise LLMUnavailable("The model is rate limited right now; try again shortly.") from exc
    except anthropic.APIStatusError as exc:
        log.warning("anthropic %s error (%s): %s", purpose, exc.status_code, exc.request_id)
        raise LLMUnavailable(f"The model returned an error ({exc.status_code}).") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMUnavailable("The model could not be reached.") from exc

    usage = response.usage
    log.info(
        "anthropic %s: model=%s stop=%s in=%s cache_read=%s cache_write=%s out=%s",
        purpose,
        response.model,
        response.stop_reason,
        usage.input_tokens,
        usage.cache_read_input_tokens,
        usage.cache_creation_input_tokens,
        usage.output_tokens,
    )
    return response


def first_tool_use(response: BetaMessage) -> Any | None:
    return next((block for block in response.content if block.type == "tool_use"), None)


def tool_result(tool_use_id: str, content: str, *, is_error: bool = False) -> dict[str, Any]:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": content,
        "is_error": is_error,
    }
