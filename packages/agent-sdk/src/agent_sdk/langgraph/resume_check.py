"""
agent_sdk.langgraph.resume_check
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
LangGraphResumeCheck — ResumeCheck tailored to LangGraph's interrupt/resume
model.

Maps the platform's generic HITL hooks onto LangGraph's specific shape:
  - one pending "HITL action" == one LangGraph `Interrupt` (id + value),
    raised by LangGraphExecutionStep when the graph pauses (see
    agent_sdk.langgraph.execution_step and StepStatus.HITL).
  - "answering" it means attaching a `response` field to the matching
    action dict (via Engine.submit_hitl_response()) before re-triggering
    the session.
  - hitl_action() returns True only once every action raised in the last
    run has a response attached.
  - resume_work() pulls that response back out of checkpoint_data into
    RESUME_VALUE_KEY, where LangGraphAgentNode/Runner picks it up on the
    next run and passes it to Command(resume=...).

Multi-interrupt note (V1 scope): this assumes a single interrupt() call is
pending at a time — the common case for sequential HITL graphs (pause once,
get one answer, continue). If your graph raises multiple parallel interrupts
in the same superstep, override hitl_action() / resume_work() to build
whatever {interrupt_id: value} mapping your graph needs for
Command(resume=...) in that case.
"""
from __future__ import annotations

from typing import Any

from agent_sdk.resume_check import ResumeCheck, RunState

# state_data key LangGraphAgentRunner reads to get the human's answer back
# for the next Command(resume=...) call.
RESUME_VALUE_KEY = "_langgraph_resume_value"


class LangGraphResumeCheck(ResumeCheck):
    """
    Default ResumeCheck for LangGraph agents. Use directly (this is what
    create_langgraph_agent() wires in by default), or subclass to override
    hitl_action()/resume_work() for custom HITL answer shapes.
    """

    def hitl_action(self, state: RunState) -> bool:
        """
        True once every pending interrupt action has a `response` attached.

        state.checkpoint_data["hitl_actions"] is populated by Engine from
        whatever was stored via Engine.submit_hitl_response() (or the
        initial pause) — each entry looks like:
            {"id": "...", "value": {...}, "response": ... | None}
        """
        actions: list[dict[str, Any]] = state.checkpoint_data.get("hitl_actions") or []
        if not actions:
            # Nothing recorded to wait for — defensive default, shouldn't
            # normally happen once a run has actually paused for HITL.
            return True
        return all(action.get("response") is not None for action in actions)

    def resume_work(self, state: RunState) -> None:
        """
        Pull the (single, V1) human response out of hitl_actions and stash
        it under RESUME_VALUE_KEY so LangGraphAgentRunner can pass it to
        Command(resume=...) on the next ExecutionStep.run() call.
        """
        actions: list[dict[str, Any]] = state.checkpoint_data.get("hitl_actions") or []
        response = next(
            (a.get("response") for a in actions if a.get("response") is not None), None
        )
        if response is not None:
            state.checkpoint_data[RESUME_VALUE_KEY] = response
