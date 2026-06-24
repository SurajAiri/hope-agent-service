"""
agent_sdk.messages
~~~~~~~~~~~~~~~~~~
Standardized Pydantic models for agent messages.
Provides full type safety across the SDK and Engine boundaries.
"""
from __future__ import annotations

from typing import Any, Literal, Union

from pydantic import BaseModel, Field


class Message(BaseModel):
    """Base message model."""
    role: str
    content: str | None = None


class SystemMessage(Message):
    role: Literal["system"] = "system"


class HumanMessage(Message):
    role: Literal["user"] = "user"


class AssistantMessage(Message):
    role: Literal["assistant"] = "assistant"
    tool_calls: list[dict[str, Any]] | None = None


class ToolCallMessage(Message):
    role: Literal["tool"] = "tool"
    tool_call_id: str
    name: str


AnyMessage = Union[SystemMessage, HumanMessage, AssistantMessage, ToolCallMessage]


def parse_message(data: dict[str, Any]) -> AnyMessage:
    """Helper to parse raw dictionaries into the appropriate Message model."""
    role = data.get("role")
    if role == "system":
        return SystemMessage.model_validate(data)
    if role == "user":
        return HumanMessage.model_validate(data)
    if role == "assistant":
        return AssistantMessage.model_validate(data)
    if role == "tool":
        return ToolCallMessage.model_validate(data)
    
    # Fallback if somehow an unknown role is passed, though AnyMessage union won't cover it directly
    # To keep it safe, we'll try to map it to a generic Message but raise an error if it's strictly enforced.
    raise ValueError(f"Unknown message role: {role}")
