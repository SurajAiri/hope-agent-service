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

Template (Engine awaits every hook — all hooks are async):
    if status == hitl:        → await hitl_action() → bool
    if status == queue/created: → await agent.validate_input() [see agent_sdk.agent.BaseAgent
                                   and agent_sdk.input_validator — NOT a ResumeCheck hook,
                                   called on the Agent directly, checkpoint_data seeded from
                                   its return value] → await initial_work()
    else:                     → await resume_work()
    if status != done:        → await before_run()  [unconditional, always fires]
    Engine then sets status=WIP

    Any hook raising is caught by Engine, which fails the run (RunStatus.FAIL)
    instead of the loop ever starting — see engine._run_resume_check.

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
                logger.info("Starting run {} for agent {}", state.session_id, state.agent_id)
    """

    # Identity
    org_id: str
    thread_id: str
    session_id: str
    agent_id: str

    # Status — string value of RunStatus enum (e.g. "queue", "wip", "hitl", "done")
    status: str

    # Conversation messages accumulated so far
    messages: list[Any]

    # Execution progress
    run_id: int
    max_runs: int

    # Arbitrary checkpoint data (agent-defined, for resume logic)
    checkpoint_data: dict[str, Any]

    # Raw initial_state dict passed in TriggerParams.initial_state on trigger,
    # untouched. By the time initial_work() fires, Engine has already run it
    # through agent.validate_input() and merged the *validated* result into
    # checkpoint_data (see engine._run_resume_check and
    # agent_sdk.agent.BaseAgent.validate_input) — this raw copy is kept here
    # too so a hook can compare "what came in" vs "what validation produced"
    # if it needs to.
    initial_state: dict[str, Any]


# ---------------------------------------------------------------------------
# ResumeCheck — hook collection
# ---------------------------------------------------------------------------


class ResumeCheck:
    """
    Default implementation of all resume hooks.
    Agents subclass this and override only what's different.

    All hooks are async (may do I/O — validate a schema, load history context
    from a connector [V2], restore from an external store, etc.) and receive
    a state: RunState parameter. Use RunState as the type annotation for IDE
    autocomplete::

        class MyAgentResumeCheck(ResumeCheck):
            async def before_run(self, state: RunState) -> None:
                logger.info("run_id={} agent={}", state.run_id, state.agent_id)

            async def resume_work(self, state: RunState) -> None:
                # Restore custom checkpoint data
                my_state = state.checkpoint_data.get("my_key")

    State / initial_state validation — NOT a ResumeCheck hook anymore:
        Validating/reshaping TriggerParams.initial_state is now
        BaseAgent.validate_input(messages, initial_state) -> dict, on the
        Agent itself (agent_sdk.agent), not here. Engine calls it once, on
        the first run only, BEFORE checkpoint_data is seeded and BEFORE
        initial_work() below fires — see engine._run_resume_check.

        Two ways to hook it, pick by how often the schema changes:
            - volatile:  Agent.create(..., input_validator=MyValidator())
                         (agent_sdk.input_validator.InputValidator subclass)
            - stable:    subclass BaseAgent/Agent and override
                         validate_input() directly

        Raising there (e.g. a pydantic ValidationError) is safe — same
        handling as any resume-check hook failure: Engine sets RunStatus.FAIL
        and skips the execution loop entirely.

        initial_work() below stays what it always was: a general first-run
        hook for anything else one-time (loading thread history [V2], etc.)
        — it now just receives already-validated checkpoint_data instead of
        the raw payload. Agents that don't need custom validation or setup
        just don't touch either seam — the run proceeds with whatever's in
        messages / checkpoint_data as-is.
    """

    async def hitl_action(self, state: RunState) -> bool:
        """
        Called when status == 'hitl'.
        Load HITL actions and check completion.

        Returns:
            True  → all HITL tasks complete, continue to before_run
            False → at least one pending, skip; WIP never set; loop won't run
        """
        # Default: no HITL actions, always complete → True
        return True

    async def initial_work(self, state: RunState) -> None:
        """
        Called when status == 'queue' or 'created' (first-time run) — AFTER
        agent.validate_input() has already run and its return value is
        merged into state.checkpoint_data (see class docstring; validation
        itself lives on the Agent now, not here). Use this for other
        one-time setup, e.g. loading context of a previous session under the
        same thread (message history) [V2].
        Default: no-op.
        """
        pass

    async def resume_work(self, state: RunState) -> None:
        """
        Called when status is NOT 'queue'/'created' and NOT 'done' (resuming).
        Checkpoint restore: load saved execution state.
        Default: no-op.
        """
        pass

    async def before_run(self, state: RunState) -> None:
        """
        Unconditional hook: fires before the execution loop, whether first run or resume.
        Engine sets status=WIP AFTER this returns.
        Default: no-op.
        """
        pass
