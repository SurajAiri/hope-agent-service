"""
agent_sdk.resume_check
~~~~~~~~~~~~~~~~~~~~~~
ResumeCheck — Template Method pattern. Provides overridable hooks for resume logic.

Key design rule (from arch):
  ENGINE controls the actual flow. ResumeCheck is just a collection of hooks.
  The control logic (_run_resume_check) lives in Engine, NOT here.

  Engine calls the hooks; Engine decides what to do with return values.

Default implementations are no-ops (safe baseline). Agents override specific
methods without duplicating the control flow.

Template:
    if status == hitl:        → hitl_action() → bool
    if status == queue/created: → initial_work()
    else:                     → resume_work()
    if status != done:        → before_run()  [unconditional, always fires]
    Engine then sets status=WIP

RunState:
    A typed read-only view of ExecutionState exposed to ResumeCheck hooks.
    Use it to annotate state parameters for IDE autocomplete and type safety.
    The actual object passed by Engine is ExecutionState, which is a superset —
    RunState is just the documented, safe-to-read subset.
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# RunState — typed view of ExecutionState visible to ResumeCheck hooks
# ---------------------------------------------------------------------------


@runtime_checkable
class RunState(Protocol):
    """
    Typed, read-only view of ExecutionState passed to ResumeCheck hook methods.

    This protocol documents the fields that ResumeCheck is allowed to read.
    The actual object is engine.ExecutionState (a superset), but hooks should
    only access the fields declared here for forward compatibility.

    Use this as the type annotation for state parameters in ResumeCheck subclasses::

        class MyResumeCheck(ResumeCheck):
            def before_run(self, state: RunState) -> None:
                logger.info("Starting run {} for agent {}", state.run_id, state.agent_id)
    """

    # Identity
    run_id: str
    org_id: str
    proj_id: str
    session_id: str
    agent_id: str

    # Status — string value of RunStatus enum (e.g. "queue", "wip", "hitl", "done")
    status: str

    # Conversation messages accumulated so far
    messages: list[Any]

    # Execution progress
    iteration: int
    max_iterations: int

    # Arbitrary checkpoint data (agent-defined, for resume logic)
    checkpoint_data: dict[str, Any]


# ---------------------------------------------------------------------------
# ResumeCheck — hook collection
# ---------------------------------------------------------------------------


class ResumeCheck:
    """
    Default implementation of all resume hooks.
    Agents subclass this and override only what's different.

    All hook methods receive a state: RunState parameter.
    Use RunState as the type annotation for IDE autocomplete::

        class MyAgentResumeCheck(ResumeCheck):
            def before_run(self, state: RunState) -> None:
                logger.info("run_id={} agent={}", state.run_id, state.agent_id)

            def resume_work(self, state: RunState) -> None:
                # Restore custom checkpoint data
                my_state = state.checkpoint_data.get("my_key")
    """

    def hitl_action(self, state: RunState) -> bool:
        """
        Called when status == 'hitl'.
        Load HITL actions and check completion.

        Returns:
            True  → all HITL tasks complete, continue to before_run
            False → at least one pending, skip; WIP never set; loop won't run
        """
        # Default: no HITL actions, always complete → True
        return True

    def initial_work(self, state: RunState) -> None:
        """
        Called when status == 'queue' or 'created' (first-time run).
        Load context of previous session under same project (message history) [V2].
        Default: no-op.
        """
        pass

    def resume_work(self, state: RunState) -> None:
        """
        Called when status is NOT 'queue'/'created' and NOT 'done' (resuming).
        Checkpoint restore: load saved execution state.
        Default: no-op.
        """
        pass

    def before_run(self, state: RunState) -> None:
        """
        Unconditional hook: fires before the execution loop, whether first run or resume.
        Engine sets status=WIP AFTER this returns.
        Default: no-op.
        """
        pass
