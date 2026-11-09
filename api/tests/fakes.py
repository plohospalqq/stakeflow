"""A scripted stand-in for the Anthropic client: no network, real SDK response objects."""

from collections.abc import Callable
from itertools import count
from typing import Any

from anthropic.types.beta import (
    BetaMessage,
    BetaTextBlock,
    BetaThinkingBlock,
    BetaToolUseBlock,
    BetaUsage,
)

_ids = count(1)


def tool_call(name: str, tool_input: dict[str, Any]) -> BetaMessage:
    """A model turn that thinks (empty, as Opus 5.5 returns it by default) and calls one tool."""
    return _message(
        "tool_use",
        [
            BetaThinkingBlock(type="thinking", thinking="", signature="sig"),
            BetaToolUseBlock(
                type="tool_use", id=f"toolu_{next(_ids)}", name=name, input=tool_input
            ),
        ],
    )


def text_reply(text: str) -> BetaMessage:
    return _message("end_turn", [BetaTextBlock(type="text", text=text)])


def refusal() -> BetaMessage:
    return _message("refusal", [])


def _message(stop_reason: str, content: list[Any]) -> BetaMessage:
    return BetaMessage(
        id=f"msg_{next(_ids)}",
        type="message",
        role="assistant",
        model="claude-opus-5-5",
        stop_reason=stop_reason,  # type: ignore[arg-type]
        content=content,
        usage=BetaUsage(input_tokens=100, output_tokens=20),
    )


class FakeAnthropic:
    """Replays scripted responses for `client.beta.messages.create` and records each call.

    A script item can be a response, or a function of the request kwargs that returns one
    (to answer based on what the code sent, e.g. echo a tool_use id).
    """

    def __init__(self, *script: BetaMessage | Callable[[dict[str, Any]], BetaMessage]) -> None:
        self.script = list(script)
        self.calls: list[dict[str, Any]] = []

    @property
    def beta(self) -> "FakeAnthropic":
        return self

    @property
    def messages(self) -> "FakeAnthropic":
        return self

    def create(self, **kwargs: Any) -> BetaMessage:
        self.calls.append(kwargs)
        if not self.script:
            raise AssertionError("the model was called more often than scripted")
        item = self.script.pop(0)
        return item(kwargs) if callable(item) else item


def last_tool_result(call: dict[str, Any]) -> dict[str, Any]:
    """The tool_result the code sent back in this request (the last user turn)."""
    content = call["messages"][-1]["content"]
    assert isinstance(content, list), "expected a tool_result turn"
    return content[-1]
