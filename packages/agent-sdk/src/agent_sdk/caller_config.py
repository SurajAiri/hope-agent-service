"""
agent_sdk.caller_config
~~~~~~~~~~~~~~~~~~~~~~~
CallerConfig — typed base for all configs passed to AgentCaller.invoke().

Every concrete config (LlmConfig, ToolCallConfig, RagConfig, …) extends
CallerConfig. This gives AgentCaller full static type safety via
Generic[TConfig] and ensures UsageTracker.log() always receives the
resource-identity fields it needs to build a complete UsageRecord.

Fields carried by CallerConfig:
    resource_type     — "llm" | "tool" | "rag" | "connector" | …
    resource_id       — e.g. model name, tool name — used as the billing key
    cost_fn_version   — pricing version for this resource (default "v1")
    caller_extras     — caller-specific tags forwarded to UsageRecord.extras
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CallerConfig(BaseModel):
    """
    Base config for all AgentCaller invocations.

    Subclasses set resource_type / resource_id automatically in @model_validator
    if the caller does not supply them explicitly.

    Do NOT instantiate CallerConfig directly — use a concrete subclass.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Resource identity — used by UsageTracker to populate UsageRecord
    resource_type: str = ""       # "llm" | "tool" | "rag" | "connector"
    resource_id: str = ""         # model name, tool name, connector id, …
    cost_fn_version: str = "v1"   # pricing version (for future cost_fn switching)

    # Free-form tags forwarded to UsageRecord.extras (set by developer, optional)
    caller_extras: dict[str, Any] = Field(default_factory=dict)

    # Flat cost per invocation (e.g. per-call API fee for a tool or connector).
    # 0.0 = no flat cost (default for all callers).
    # LLM per-token costs live on LlmConfig (input_cost_per_token / output_cost_per_token).
    # Tool authors declare this on BaseTool.cost_per_call (ClassVar); ToolCaller reads it there.
    cost_per_call: float = 0.0
