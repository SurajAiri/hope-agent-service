"""
agent_sdk.langgraph.messages
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Default message adapters between agent_sdk.messages.AnyMessage and
LangChain's BaseMessage — the two message worlds this wrapper bridges.

These defaults assume the common `MessagesState` convention: the graph's
state has a "messages" key holding a list of LangChain BaseMessage, combined
via the add_messages reducer. If your graph's schema is different, pass your
own input_adapter / output_adapter / new_messages_adapter to
create_langgraph_agent() or LangGraphAgentRunner() directly.
"""
from __future__ import annotations

from typing import Any

from agent_sdk.messages import (
    AnyMessage,
    AssistantMessage,
    HumanMessage,
    SystemMessage,
    ToolCallMessage,
)


def _require_langchain_core() -> Any:
    try:
        import langchain_core.messages as lc_messages

        return lc_messages
    except ImportError as exc:
        raise ImportError(
            "langchain-core is not installed (required for the default LangGraph "
            "message adapters). Install it with:\n"
            "  pip install langchain-core\n"
            "Or pass your own input_adapter/output_adapter/new_messages_adapter "
            "if your graph doesn't use the MessagesState convention."
        ) from exc


def _content_to_str(content: Any) -> str:
    """LangChain message content can be a plain str or a list of content blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
        return "".join(parts)
    return "" if content is None else str(content)


def sdk_message_to_lc(message: AnyMessage) -> Any:
    """Convert one agent_sdk message to a LangChain BaseMessage."""
    lc = _require_langchain_core()
    if isinstance(message, SystemMessage):
        return lc.SystemMessage(content=message.content or "")
    if isinstance(message, HumanMessage):
        return lc.HumanMessage(content=message.content or "")
    if isinstance(message, AssistantMessage):
        return lc.AIMessage(content=message.content or "", tool_calls=message.tool_calls or [])
    if isinstance(message, ToolCallMessage):
        return lc.ToolMessage(
            content=message.content or "",
            tool_call_id=message.tool_call_id,
            name=message.name,
        )
    raise TypeError(f"Unsupported agent_sdk message type: {type(message).__name__}")


def lc_message_to_sdk(message: Any) -> AnyMessage:
    """Convert one LangChain BaseMessage back to an agent_sdk message."""
    lc = _require_langchain_core()
    if isinstance(message, lc.SystemMessage):
        return SystemMessage(content=_content_to_str(message.content))
    if isinstance(message, lc.HumanMessage):
        return HumanMessage(content=_content_to_str(message.content))
    if isinstance(message, lc.ToolMessage):
        return ToolCallMessage(
            content=_content_to_str(message.content),
            tool_call_id=message.tool_call_id,
            name=message.name or "",
        )
    if isinstance(message, lc.AIMessage):
        return AssistantMessage(
            content=_content_to_str(message.content),
            tool_calls=message.tool_calls or None,
        )
    # Fallback for anything else (e.g. FunctionMessage) — best-effort as assistant text.
    return AssistantMessage(content=_content_to_str(getattr(message, "content", "")))


def default_input_adapter(messages: list[AnyMessage]) -> dict[str, Any]:
    """Default input builder — MessagesState convention: {"messages": [...]}."""
    return {"messages": [sdk_message_to_lc(m) for m in messages]}


def default_new_messages_adapter(
    known_count: int, final_values: dict[str, Any]
) -> list[AnyMessage]:
    """
    Default new-messages extractor (MessagesState convention).

    `known_count` is how many LangChain messages the platform has already
    recorded (tracked across runs by LangGraphAgentRunner) — everything past
    that index in final_values["messages"] is new since the last run,
    including on a resume (where the "input" isn't a messages list at all,
    it's a Command(resume=...), so we can't just diff against input length).
    """
    lc_messages = final_values.get("messages", [])
    return [lc_message_to_sdk(m) for m in lc_messages[known_count:]]


def default_output_adapter(final_values: dict[str, Any]) -> Any:
    """Default output extractor — content of the last message (MessagesState)."""
    lc_messages = final_values.get("messages", [])
    if not lc_messages:
        return None
    return _content_to_str(lc_messages[-1].content)
