"""
agent_sdk.types
~~~~~~~~~~~~~~~
Shared protocols and data types for the Agent SDK.
The Agent SDK knows ONLY about these interfaces — it has zero infrastructure knowledge.
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from agent_sdk.caller_config import CallerConfig
    from agent_sdk.messages import AssistantMessage


# ---------------------------------------------------------------------------
# Usage data
# ---------------------------------------------------------------------------


class Usage(BaseModel):
    """Token / request usage for a single invoke."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    request_count: int = 1
    raw: dict[str, Any] = Field(default_factory=dict)

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            request_count=self.request_count + other.request_count,
            raw={},
        )


# ---------------------------------------------------------------------------
# Tool call — typed, JSON-parsed
# ---------------------------------------------------------------------------


class ToolCall(BaseModel):
    """
    A parsed tool call returned by an LLM.

    Replaces raw dict juggling (json.loads, key navigation, JSONDecodeError handling).
    LitellmAgentRunner populates AgentResponse.tool_calls with these.

    Fields:
        id:         Tool call ID (from LLM, needed for ToolCallMessage.tool_call_id)
        name:       Tool name (matches BaseTool.name / registered tool name)
        arguments:  Already JSON-parsed arguments dict — no manual json.loads needed

    Usage in ExecutionStep::

        for tc in response.tool_calls:
            result = await agent_context.tool_caller.dispatch(tc.name, tc.arguments)
            messages.append(ToolCallMessage(tool_call_id=tc.id, name=tc.name, content=result.content))
    """

    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "ToolCall":
        """
        Parse from a LiteLLM / OpenAI raw tool_call dict.
        Safe on malformed JSON — falls back to empty dict on parse error.

        Expected raw shape:
            {"id": "...", "function": {"name": "...", "arguments": "{...}"}, "type": "function"}
        """
        try:
            args = json.loads(raw["function"]["arguments"])
            if not isinstance(args, dict):
                args = {}
        except (json.JSONDecodeError, KeyError, TypeError):
            args = {}
        return cls(
            id=raw.get("id", ""),
            name=raw.get("function", {}).get("name", ""),
            arguments=args,
        )

    def to_raw(self) -> dict[str, Any]:
        """Serialize back to OpenAI/LiteLLM raw tool_call dict format."""
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments),
            },
        }


# ---------------------------------------------------------------------------
# Response / streaming types
# ---------------------------------------------------------------------------


class AgentResponse(BaseModel):
    """Final response returned from AgentCaller.invoke()."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    content: Any
    usage: Usage | None = None

    # Typed tool calls — populated by LitellmAgentRunner when LLM returns tool calls.
    # Use this instead of response.metadata["tool_calls"] (raw dicts).
    tool_calls: list[ToolCall] = Field(default_factory=list)

    metadata: dict[str, Any] = Field(default_factory=dict)

    def to_assistant_message(self) -> "AssistantMessage":
        """
        Build an AssistantMessage from this response.

        Handles tool_calls automatically — no manual construction needed.
        Use this in ExecutionStep instead of manually building AssistantMessage.

        Example::

            response = await agent_runner.invoke(...)
            messages.append(response.to_assistant_message())
        """
        from agent_sdk.messages import AssistantMessage

        raw_tool_calls = [tc.to_raw() for tc in self.tool_calls] or None
        return AssistantMessage(
            content=str(self.content) if self.content is not None else "",
            tool_calls=raw_tool_calls,
        )


class StreamChunk(BaseModel):
    """A single chunk in a streaming response."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    content_delta: str = ""
    usage_delta: Usage | None = None
    is_final: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------


class CostResult(BaseModel):
    """Result of a cost calculation."""

    credit_cost: float
    version: str = "v1"
    breakdown: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Protocols — the ONLY interfaces AgentCaller (and its children) depend on
# ---------------------------------------------------------------------------


@runtime_checkable
class UsageTrackerProtocol(Protocol):
    """
    Protocol for logging usage from within AgentCaller.

    Implemented by engine.UsageTracker.
    Injected into AgentCaller via _usage_tracker.
    status='error' is a log flag only — alerting is the Engine's responsibility.

    config is CallerConfig (not Any) — engine.UsageTracker extracts
    resource_type, resource_id, cost_fn_version, caller_extras from it
    to populate the UsageRecord.
    """

    def log(
        self,
        config: "CallerConfig",
        usage: Usage | None,
        cost: CostResult | None,
        status: str,  # 'success' | 'error'
    ) -> None: ...


@runtime_checkable
class StreamerProtocol(Protocol):
    """
    Protocol for streaming chunks from within AgentCaller.

    Implemented by runner.SSEStreamer (or any other transport).
    Injected into AgentCaller via _streamer.
    Smart lifecycle: opens/closes per .stream(...) call, does NOT hold connection blindly.
    """

    async def push(self, chunk: StreamChunk) -> None: ...
