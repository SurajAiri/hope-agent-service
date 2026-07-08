"""
fastapi_demo.agents.langgraph_hitl_approval_agent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
A second, more "from scratch" agent_sdk.langgraph example. Unlike
`langgraph_agent.py` (which uses LangGraph's built-in `MessagesState`
convention), this graph defines its **own custom state schema**:

    class ApprovalState(TypedDict):
        query: str                  # the user's original request
        decision: str | None        # "approved" | "rejected", set by the human
        response: str | None        # final answer shown to the user

Because the state has no "messages" key, the default (MessagesState-shaped)
input/output/new-messages adapters don't apply here — see
agent_sdk.langgraph.messages for what they assume. This file supplies its own
three adapters instead, which is the pattern to follow any time your graph's
state doesn't hold a list of LangChain BaseMessage.

Flow:
    START -> human_approval -> [approved] -> call_llm  -> END
                             -> [rejected] -> reject     -> END

    human_approval:  pauses the run (interrupt()) asking a human reviewer to
                      approve or reject the incoming query. This is what
                      turns into RunStatus.HITL.
    call_llm:         only reached if approved — sends the query to an LLM
                      and stores the answer in `response`.
    reject:           only reached if rejected — stores a fixed "rejected"
                      response, the LLM is never called.

Try it end to end:
    1. POST /call {"agent_id": "langgraph-hitl-approval", "messages": [...]}
       -> run pauses, response session status is "hitl"
    2. Read the pending action (GET /session/{session_id}/hitl) and answer it
       with "approve" or "reject" (POST /session/{session_id}/hitl).
    3. POST /call again with the same session_id -> run resumes, either calls
       the LLM or short-circuits to a rejection message, then completes.
"""
from __future__ import annotations

import os
from typing import Any, TypedDict

from agent_sdk.langgraph import LangGraphAgent
from agent_sdk.messages import AnyMessage, AssistantMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class ApprovalState(TypedDict):
    """Custom graph state — deliberately *not* the MessagesState convention."""

    query: str
    decision: str | None
    response: str | None


# --------------------------------------------------------------------------
# Nodes
# --------------------------------------------------------------------------


def _human_approval(state: ApprovalState) -> dict:
    """Pause and ask a human reviewer to approve or reject the query."""
    decision = interrupt(
        {
            "question": "Approve this request before it's sent to the LLM?",
            "description": f"Query: {state['query']!r}",
            "options": ["approve", "reject"],
        }
    )
    approved = str(decision).strip().lower() in ("approve", "approved", "yes", "y", "true")
    return {"decision": "approved" if approved else "rejected"}


def _route_after_approval(state: ApprovalState) -> str:
    """Conditional edge: send to the LLM only if approved."""
    return "call_llm" if state["decision"] == "approved" else "reject"


def _call_llm(state: ApprovalState) -> dict:
    """
    Approved path — send the query to an LLM. Uses a plain langchain chat
    model directly (this is LangGraph's own LLM call — it does not go
    through agent_sdk's LitellmAgentRunner/UsageTracker; see
    agent_sdk.langgraph.runner docstring for why that's a documented
    limitation, not a bug).
    """
    try:
        from langchain_core.messages import HumanMessage as LCHumanMessage
        from langchain_fireworks import ChatFireworks

        llm = ChatFireworks(
            model="accounts/fireworks/models/deepseek-v4-flash",
            api_key=os.environ.get("FIREWORKS_API_KEY", ""),
        )
        result = llm.invoke([LCHumanMessage(content=state["query"])])
        answer = result.content if isinstance(result.content, str) else str(result.content)
    except Exception:
        # No API key configured in this demo environment — fall back to a
        # canned answer so the approve path can still be exercised end to end.
        answer = f"(demo LLM) Here's a response to: {state['query']!r}"
    return {"response": answer}


def _reject(state: ApprovalState) -> dict:
    """Rejected path — never touches the LLM."""
    return {"response": "Request rejected by reviewer — the query was not sent to the LLM."}


def build_graph() -> StateGraph:
    graph = StateGraph(ApprovalState)
    graph.add_node("human_approval", _human_approval)
    graph.add_node("call_llm", _call_llm)
    graph.add_node("reject", _reject)
    graph.add_edge(START, "human_approval")
    graph.add_conditional_edges(
        "human_approval",
        _route_after_approval,
        {"call_llm": "call_llm", "reject": "reject"},
    )
    graph.add_edge("call_llm", END)
    graph.add_edge("reject", END)
    return graph


# --------------------------------------------------------------------------
# Custom adapters — required because this graph's state doesn't use the
# "messages" key that the default (MessagesState-convention) adapters
# assume. See agent_sdk.langgraph.messages for the defaults these replace.
# --------------------------------------------------------------------------


def _input_adapter(messages: list[AnyMessage]) -> dict[str, Any]:
    """Take the last human message's text as the query; reset decision/response."""
    query = messages[-1].content if messages else ""
    return {"query": query or "", "decision": None, "response": None}


def _output_adapter(final_values: dict[str, Any]) -> Any:
    """StepResult.output is just the final response text (or None while pending)."""
    return final_values.get("response")


def _new_messages_adapter(known_count: int, final_values: dict[str, Any]) -> list[AnyMessage]:
    """
    Emit exactly one assistant message once the run has a final response, so
    the platform's own conversation history (checkpointed by the Engine)
    reflects the outcome. While the run is paused on the approval interrupt,
    `response` is still None, so nothing is emitted yet.
    """
    response = final_values.get("response")
    if response is None:
        return []
    decision = final_values.get("decision")
    return [AssistantMessage(content=f"[decision={decision}] {response}")]


def langgraph_hitl_approval_agent_factory(agent_id: str) -> LangGraphAgent:
    return LangGraphAgent.create(
        agent_id,
        graph_builder=build_graph,
        max_runs=10,
        input_adapter=_input_adapter,
        output_adapter=_output_adapter,
        new_messages_adapter=_new_messages_adapter,
    )
