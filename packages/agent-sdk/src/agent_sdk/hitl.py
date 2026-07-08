"""
agent_sdk.hitl
~~~~~~~~~~~~~~
Typed shapes for human-in-the-loop pauses.

HitlAction is the canonical shape every ExecutionStep should use when it
returns StepResult(status=StepStatus.HITL, hitl_actions=[...]) — whether the
step is a custom python loop or agent_sdk.langgraph (LangGraphExecutionStep
builds these automatically from interrupt() payloads, see
agent_sdk.langgraph.runner._finish).

HitlResponseInput is the shape the application layer sends back once a human
has answered — just the action_id + their response, not the whole action.
Engine.submit_hitl_response() looks up the matching stored action by id and
attaches `response` to it (merge, not replace) — see engine.engine.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class HitlAction(BaseModel):
    """
    One pending (or answered) human-in-the-loop action.

    Fields:
        id:          Stable identifier for this action within the run.
                     For agent_sdk.langgraph agents this is the LangGraph
                     Interrupt.id. For custom ExecutionStep code, pick
                     anything stable across the pause/resume boundary.
        question:    The prompt shown to the human.
        description: Optional extra context (freeform, for display only).
        options:     Optional fixed set of choices. None => free-text answer.
        response:    The human's answer once submitted. None while pending.
    """

    id: str
    question: str
    description: str | None = None
    options: list[str] | None = None  # None => free-text answer
    response: Any | None = None


class HitlResponseInput(BaseModel):
    """
    What the application layer submits to answer one pending HitlAction.

    Only action_id + response are required — callers don't need to resend
    the full action (question/description/options are already known to
    Engine from when the action was first stored).
    """

    action_id: str
    response: Any
