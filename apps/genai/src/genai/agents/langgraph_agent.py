"""
genai.agents.langgraph_agent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Demonstrates agent_sdk.langgraph — a LangGraph StateGraph wired into the
platform through LangGraphAgent.create(), including one human-in-the-loop
approval gate via LangGraph's interrupt().

Flow:
    START -> draft_reply -> approval_gate -> send_reply -> END

    draft_reply:     calls an LLM (via LiteLLM, plain langchain chat model)
                      to draft a reply to the user's message.
    approval_gate:    pauses the run (interrupt()) asking a human to approve
                      the draft before it goes out. This is what turns into
                      RunStatus.HITL — see agent_sdk.langgraph.resume_check.
    send_reply:       only reached once a human has answered "yes"/"no".

Try it end to end:
    1. POST /call {"agent_id": "langgraph-approval", "messages": [...]}
       -> run pauses, response session status is "hitl"
    2. Read the pending action (GET wherever your app exposes
       engine._execution_manager.load_hitl_actions(session_id) — a thin
       endpoint for this is left to the app layer, same as any other HITL
       agent) and answer it via engine.submit_hitl_response(session_id, [...])
    3. POST /call again with the same session_id -> run resumes and completes.
"""

from __future__ import annotations

import os

from agent_sdk.langgraph import LangGraphAgent
from langchain_core.messages import AIMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import interrupt


def _draft_reply(state: MessagesState) -> dict:
    """
    Draft a reply. Uses a plain langchain chat model directly (this is
    LangGraph's own LLM call — it does not go through agent_sdk's
    LitellmAgentRunner/UsageTracker; see agent_sdk.langgraph.runner
    docstring for why that's a documented limitation, not a bug).
    """
    try:
        from langchain_fireworks import ChatFireworks

        llm = ChatFireworks(
            model="accounts/fireworks/models/deepseek-v4-flash",
            api_key=os.environ.get("FIREWORKS_API_KEY", ""),
        )
        reply = llm.invoke(state["messages"])
    except Exception:
        # No API key configured in this demo environment — fall back to a
        # canned draft so the HITL flow can still be exercised end to end.
        last_user_text = state["messages"][-1].content if state["messages"] else ""
        reply = AIMessage(content=f"Draft reply to: {last_user_text!r}")
    return {"messages": [reply]}


def _approval_gate(state: MessagesState) -> dict:
    """Pause for a human to approve the drafted reply before sending it."""
    draft = state["messages"][-1].content
    decision = interrupt(
        {"question": "Approve this reply before sending?", "draft": draft}
    )
    approved = str(decision).strip().lower() in (
        "yes",
        "y",
        "true",
        "approve",
        "approved",
    )
    return {"messages": [AIMessage(content=f"[approval={approved}]")]}


def _send_reply(state: MessagesState) -> dict:
    approved = "[approval=true]" in (state["messages"][-1].content or "")
    draft = state["messages"][-2].content if len(state["messages"]) >= 2 else ""
    if approved:
        return {"messages": [AIMessage(content=f"Sent: {draft}")]}
    return {"messages": [AIMessage(content="Reply was not approved — nothing sent.")]}


def build_graph() -> StateGraph:
    graph = StateGraph(MessagesState)
    graph.add_node("draft_reply", _draft_reply)
    graph.add_node("approval_gate", _approval_gate)
    graph.add_node("send_reply", _send_reply)
    graph.add_edge(START, "draft_reply")
    graph.add_edge("draft_reply", "approval_gate")
    graph.add_edge("approval_gate", "send_reply")
    graph.add_edge("send_reply", END)
    return graph


def langgraph_agent_factory(agent_id: str) -> LangGraphAgent:
    return LangGraphAgent.create(
        agent_id,
        graph_builder=build_graph,
        max_runs=10,
    )
