"""
LangGraph agent wired into agent-service-core, calling the LLM via LiteLLM
directly inside the graph node (NOT via agent_sdk.LitellmAgentRunner —
create_langgraph_agent()'s own docstring says LangGraph agents make their
own internal model calls; the LitellmAgentRunner/UsageTracker path is
bypassed by design for graph-internal calls).

Why LiteLLM here: one string swaps the provider. No code change to go from
OpenAI to Anthropic to Gemini to a local vLLM endpoint.
    AGENT_MODEL=openai/gpt-4o-mini
    AGENT_MODEL=anthropic/claude-sonnet-4-20250514
    AGENT_MODEL=gemini/gemini-2.0-flash
    AGENT_MODEL=fireworks_ai/accounts/fireworks/models/deepseek-v3
(full prefix list: https://docs.litellm.ai/docs/providers)
API keys: litellm reads the provider's standard env var itself
(OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, ...). You don't need
to pass api_key= manually unless you're using a non-standard key name.

HITL SHAPE — read this before wiring your own graph:
LangGraph's interrupt() has no "multiple choice" primitive. The dict you
pass to interrupt() IS the entire contract with whoever answers it. Here
the payload is:
    {"question": str, "draft": str, "options": list[str]}
and the expected `response` (what you POST back via
POST /session/{id}/hitl) is:
    {"decision": "approve" | "reject" | "edit", "edited_draft": str | None}
Nothing in the framework enforces this shape — I validate it explicitly
in _approval_gate below. If you skip validation, a malformed response
(typo, wrong key, None) will silently fall through to the "rejected"
branch, which is a bad failure mode to discover in production.

END-TO-END FLOW (resume is NOT automatic — see main.py note at bottom):
    1. POST /call {"agent_id": "langgraph-litellm-approval", "messages": [...]}
       -> run pauses, status == "hitl"
    2. GET /session/{session_id}/hitl
       -> {"session_id": "...", "actions": [{"id": "...", "value": {...}, "response": null}]}
    3. POST /session/{session_id}/hitl
       -> body is the SAME list with "response" filled in on the answered action(s):
          [{"id": "<same id>", "value": {...}, "response": {"decision": "approve", "edited_draft": null}}]
    4. POST /call {"session_id": "<same session_id>", "messages": [...], "agent_id": "..."}
       -> YOU must call this. Nothing does it for you. This re-triggers
          resume_check.hitl_action() -> True -> resume_work() -> graph
          continues from Command(resume=...).
"""

from __future__ import annotations

import os
from typing import Any, Literal

from agent_sdk import Agent
from agent_sdk.langgraph import create_langgraph_agent
from langchain_core.messages import AIMessage, convert_to_openai_messages
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import interrupt
from loguru import logger

# --- model selection ---------------------------------------------------
# One env var controls the whole agent's model. Change provider by
# changing this string only — no code touches this anywhere else.
MODEL = os.environ.get(
    "AGENT_MODEL", "fireworks_ai/accounts/fireworks/models/deepseek-v4-flash"
)

VALID_DECISIONS = {"approve", "reject", "edit"}


async def _call_llm(messages: list, **litellm_kwargs: Any) -> str:
    """
    Direct litellm.acompletion() call.

    This bypasses agent_sdk's UsageTracker/BillManager (documented
    limitation of LangGraph agents — see agent_sdk.langgraph.runner
    module docstring). If cost tracking on THIS call matters to you,
    log it yourself via engine.usage_tracker.log(...) from inside the
    node, or don't use raw LangGraph nodes for LLM calls you need billed.
    """
    import litellm  # lazy import — same pattern as agent_sdk.litellm_runner

    response = await litellm.acompletion(
        model=MODEL,
        messages=convert_to_openai_messages(messages),
        **litellm_kwargs,
    )
    return response.choices[0].message.content or ""


# --- graph nodes ---------------------------------------------------------


async def _draft_reply(state: MessagesState) -> dict:
    """Draft a reply via LiteLLM. No provider-specific code here at all."""
    try:
        content = await _call_llm(state["messages"], temperature=0.7)
    except Exception as exc:
        # Do NOT silently fall back to a canned string here — that hides
        # real outages (bad API key, provider down, rate limit) behind a
        # response that looks like a normal draft. Fail loud; Engine's
        # ErrorHandler.alert() + RunStatus.FAIL path exists exactly for this.
        logger.error("langgraph-litellm-approval: draft LLM call failed: {}", exc)
        raise
    return {"messages": [AIMessage(content=content)]}


def _approval_gate(state: MessagesState) -> dict:
    """
    Pause for a human decision. Payload is fully custom — LangGraph does
    not enforce a shape, we do.
    """
    draft = state["messages"][-1].content

    raw_response = interrupt(
        {
            "question": "Approve this reply before sending?",
            "draft": draft,
            "options": sorted(VALID_DECISIONS),
        }
    )

    # --- validate the human's response ourselves; nothing else will ---
    if (
        not isinstance(raw_response, dict)
        or raw_response.get("decision") not in VALID_DECISIONS
    ):
        logger.warning(
            "langgraph-litellm-approval: malformed HITL response={} — treating as reject",
            raw_response,
        )
        decision: Literal["approve", "reject", "edit"] = "reject"
        edited_draft = None
    else:
        decision = raw_response["decision"]
        edited_draft = raw_response.get("edited_draft")

    if decision == "edit" and not edited_draft:
        logger.warning(
            "langgraph-litellm-approval: decision='edit' but no edited_draft provided — treating as reject"
        )
        decision = "reject"

    final_text = edited_draft if decision == "edit" else draft
    return {"messages": [AIMessage(content=f"[decision={decision}]{final_text}")]}


def _send_reply(state: MessagesState) -> dict:
    last = state["messages"][-1].content or ""
    print(last)
    if last.startswith("[decision=approve]") or last.startswith("[decision=edit]"):
        text = last.split("]", 1)[1]
        return {"messages": [AIMessage(content=f"Sent: {text}")]}
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


def langgraph_litellm_agent_factory(agent_id: str) -> Agent:
    return create_langgraph_agent(
        agent_id,
        graph_builder=build_graph,
        max_runs=10,
    )


# ---------------------------------------------------------------------------
# Register in main.py's lifespan(), same as the demo agent:
#   runner.register_agent("langgraph-litellm-approval", langgraph_litellm_agent_factory)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# OPTIONAL — auto-resume patch for main.py.
# By default (verified: no code anywhere calls trigger_session again after
# submit_hitl_response), YOU must POST /call again after answering HITL.
# If you want auto-resume, replace the existing submit_hitl_actions route
# in main.py with this:
#
# @app.post("/session/{session_id}/hitl", tags=["Agent Session"])
# async def submit_hitl_actions(session_id: str, actions: list[dict[str, Any]]):
#     r = _get_runner()
#     if r._engine is None:
#         raise HTTPException(status_code=503, detail="Engine not initialized")
#
#     await r._engine.submit_hitl_response(session_id, actions)
#
#     all_answered = all(a.get("response") is not None for a in actions)
#     if all_answered:
#         state = await r._engine._execution_manager.checkpoint_restore(session_id)
#         if state is not None:
#             from engine.types import TriggerParams
#             params = TriggerParams(
#                 idem_key=str(uuid.uuid4()),
#                 agent_id=state.agent_id,
#                 org_id=state.org_id,
#                 thread_id=state.thread_id,
#                 session_id=session_id,
#                 messages=[],          # resume path ignores fresh messages, restores from checkpoint
#                 stream=False,
#                 webhook=state.webhook,
#                 webhook_config=state.webhook_config,
#             )
#             asyncio.create_task(r.trigger_session(params))
#
#     return JSONResponse({"session_id": session_id, "status": "recorded"})
#
# Caveat: you now need to know the agent_id up front to rebuild TriggerParams
# (pulled from the restored checkpoint above), and any error in that
# background re-trigger is swallowed the same way /call's fire-and-forget
# task already swallows errors (see trigger_session in main.py) — you'd
# want proper error surfacing before shipping this, not just copy-pasting it.
# ---------------------------------------------------------------------------
