"""
agent_sdk.langgraph
~~~~~~~~~~~~~~~~~~~~
Optional LangGraph integration for the Agent SDK.

Lets developers write a plain LangGraph `StateGraph` (with `interrupt()`
calls for HITL where needed) and register it as an Agent through the
platform, exactly like a pure-python ReActExecutionStep agent — same
lifecycle, same checkpointing, same HITL support.

Install with: pip install 'hope-agent-sdk[langgraph]'

Quick start::

    from langgraph.graph import StateGraph, MessagesState, START, END
    from agent_sdk.langgraph import LangGraphAgent

    def build_graph() -> StateGraph:
        g = StateGraph(MessagesState)
        g.add_node("call_model", call_model)
        g.add_edge(START, "call_model")
        g.add_edge("call_model", END)
        return g

    def my_factory(agent_id: str) -> LangGraphAgent:
        return LangGraphAgent.create(agent_id, graph_builder=build_graph)

(create_langgraph_agent() still works — deprecated shim for LangGraphAgent.create())

Nothing in this package imports langgraph/langchain-core at module level —
only calling into a graph (i.e. actually running an agent) requires them to
be installed. Importing `agent_sdk.langgraph` is always safe.

See docs/agent-sdk/09-langgraph.md for the full guide, including HITL.
"""
from __future__ import annotations

from agent_sdk.langgraph.agent import LangGraphAgent, create_langgraph_agent
from agent_sdk.langgraph.execution_step import LangGraphExecutionStep
from agent_sdk.langgraph.resume_check import LangGraphResumeCheck
from agent_sdk.langgraph.runner import LangGraphAgentRunner

__all__ = [
    "LangGraphAgent",
    "create_langgraph_agent",  # deprecated — use LangGraphAgent.create()
    "LangGraphAgentRunner",
    "LangGraphExecutionStep",
    "LangGraphResumeCheck",
]
