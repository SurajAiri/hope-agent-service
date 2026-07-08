"""
agent_sdk.input_validator
~~~~~~~~~~~~~~~~~~~~~~~~~
InputValidator — the injectable half of BaseAgent.validate_input().

Two ways to customize input validation for an agent — pick whichever matches
how often it's going to change:

  1. INJECTABLE (expected to be volatile — schema changes per version/release,
     you don't want a subclass per variant):

         class MySchemaValidator(InputValidator):
             async def validate(self, messages, initial_state) -> dict:
                 return MyStateSchema.model_validate(initial_state).model_dump()

         Agent.create(agent_id, agent_profile=PROFILE,
                      input_validator=MySchemaValidator())

  2. MEMBER FUNCTION (stable — intrinsic to this one agent, rarely if ever
     swapped out): subclass BaseAgent/Agent and override validate_input()
     directly, ignore input_validator entirely.

Called by Engine exactly once per session — on the first run only
(status == QUEUE/CREATED), BEFORE anything is merged into checkpoint_data and
BEFORE resume_check.initial_work() fires. Never called again on resume.
See agent_sdk.agent.BaseAgent.validate_input and engine._run_resume_check.

Raising here (e.g. a pydantic ValidationError) is safe: Engine catches it,
sets RunStatus.FAIL with the error message, and the execution loop never
starts — same handling as any other resume-check hook failure.
"""
from __future__ import annotations

import abc
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from agent_sdk.messages import AnyMessage
else:
    AnyMessage = Any


class InputValidator(abc.ABC):
    """
    ABC for the injectable half of input validation.

    Subclass this when validation logic is likely to change independently of
    the agent it's attached to (e.g. a schema that gets versioned separately).
    If it's stable and intrinsic to one agent, skip this entirely and override
    BaseAgent.validate_input() directly instead.
    """

    @abc.abstractmethod
    async def validate(
        self, messages: "list[AnyMessage]", initial_state: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Validate/reshape the trigger-time payload.

        Args:
            messages:      TriggerParams.messages — read-only. Only needed if
                           your validation has to cross-check state against
                           the incoming conversation; usually initial_state
                           alone is enough.
            initial_state: TriggerParams.initial_state, raw, exactly as given
                           by the caller. NOT yet merged into checkpoint_data.

        Returns:
            dict merged into ExecutionState.checkpoint_data verbatim.
            Return initial_state unchanged (or a superset) if there's nothing
            to validate/reshape.

        Raise to reject the trigger outright (e.g. pydantic.ValidationError) —
        Engine turns this into RunStatus.FAIL before the execution loop starts.
        """
        ...


class PassthroughInputValidator(InputValidator):
    """
    Default validator — no validation, returns initial_state unchanged.
    This is what every agent gets unless it sets input_validator= or
    overrides validate_input() — matches today's no-validation behavior.
    """

    async def validate(
        self, messages: "list[AnyMessage]", initial_state: dict[str, Any]
    ) -> dict[str, Any]:
        return dict(initial_state)
