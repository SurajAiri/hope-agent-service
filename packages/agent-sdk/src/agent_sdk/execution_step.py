"""
agent_sdk.execution_step
~~~~~~~~~~~~~~~~~~~~~~~~
ExecutionStep — one run of the execution loop.

KEY DESIGN RULE: ExecutionStep is a DEVELOPER-CONTROLLED hook.
The Engine calls `execution_step.run(...)` on each run.
Developers implement their own step logic — how they call the agent runner,
whether they loop for tool calls, how they decide completion — it's all theirs.

The SDK provides:
  - StepContext: the input the developer receives (messages, stream, run)
  - StepResult: the output the developer must return (status + updated messages + output)
  - StepStatus: the possible outcomes
  - ExecutionStep (ABC): the interface Engine calls
  - DefaultExecutionStep: single-turn (no tool calls)
  - ReActExecutionStep: ReAct loop (LLM → tool calls → loop → complete)

DefaultExecutionStep and ReActExecutionStep auto-inject system_prompt from the
AgentProfile if it is set and the message list does not already contain a system message.

Custom steps:
    class MyExecutionStep(ExecutionStep):
        async def run(self, agent_runner, agent_context, context) -> StepResult:
            # Full control — use agent_runner.invoke(), tool_caller.dispatch(), etc.
            response = await agent_runner.invoke(
                config=agent_runner.default_config,
                messages=context.messages,
                stream=context.stream,
            )
            return StepResult(status=StepStatus.COMPLETE, messages=[...], output=response.content)
"""
from __future__ import annotations

import abc
from enum import Enum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field

from agent_sdk.messages import AnyMessage, AssistantMessage, SystemMessage, ToolCallMessage

if TYPE_CHECKING:
    from agent_sdk.agent_context import AgentContext
    from agent_sdk.agent_runner import AgentRunner


class StepStatus(str, Enum):
    """Outcome of one execution step. Returned in StepResult.status."""

    COMPLETE = "complete"        # Agent signals done — Engine sets DONE, breaks loop
    CONTINUE = "continue"        # More runs needed — Engine loops again
    ERROR = "error"              # Step failed — Engine sets FAIL, breaks loop
    INTERRUPTED = "interrupted"  # Developer detected an interrupt — Engine sets INTERRUPT
    HITL = "hitl"                # Needs human input before continuing — Engine sets HITL,
                                  # persists StepResult.hitl_actions as the pending actions.
                                  # Re-triggering later re-enters resume_check.hitl_action(),
                                  # which decides (from checkpoint_data["hitl_actions"]) whether
                                  # every action now has a response and the loop should resume.


class StepContext(BaseModel):
    """
    Input context passed to ExecutionStep.run() on each loop run.
    Engine builds this from its internal ExecutionState.
    Developer reads this — treat as immutable within a step.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: list[AnyMessage]        # Current conversation messages (input + history so far)
    stream: bool                # Whether this run is in streaming mode
    run_id: int              # Current loop run number (1-indexed)
    # Agent-opaque state: Engine populates from checkpoint_data.
    # Developers can read/write this to persist state across iterations.
    # On COMPLETE/CONTINUE, Engine checkpoints whatever is here.
    state_data: dict[str, Any] = Field(default_factory=dict)


class StepResult(BaseModel):
    """
    Output returned from ExecutionStep.run().
    Engine reads status + messages + output — everything else is ignored.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    status: StepStatus

    # Updated messages to carry forward (MUST include any assistant/tool messages added this step)
    messages: list[AnyMessage] = Field(default_factory=list)

    # Final output if status == COMPLETE (stored in ExecutionState.result)
    output: Any = None

    # Explicit error message when status == ERROR.
    # Engine reads this first, then falls back to metadata.get("error") for backward compat.
    error: str | None = None

    # Optional: updated state_data to persist to checkpoint (merged into checkpoint_data by Engine)
    state_data: dict[str, Any] | None = None

    # Required when status == HITL: the pending human actions. Each entry must
    # be JSON-serializable (Engine stores this list verbatim in Redis). Engine
    # ignores this field for every other status.
    hitl_actions: list[dict[str, Any]] | None = None

    # Developer-facing metadata (not used by Engine — for observability / logging)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExecutionStep(abc.ABC):
    """
    Abstract base for one run of the execution loop.

    Engine calls:
        step_result = execution_step.run(agent_runner, agent_context, context)

    Developers implement run() with full control over:
      - Which LLM config to use (agent_runner.default_config or agent_runner.agent_profile.get_config("fast"))
      - Whether to do tool calls (and how many rounds)
      - How to decide completion vs. continuation
      - What to return in messages and output

    The agent_runner and agent_context.tool_caller already have
    _usage_tracker and _streamer injected by Runner — they handle
    usage logging and streaming transparently.
    """

    @abc.abstractmethod
    async def run(
        self,
        agent_runner: "AgentRunner",
        agent_context: "AgentContext",
        context: StepContext,
    ) -> StepResult:
        """
        Execute one run of the agent loop (async).

        Args:
            agent_runner: LLM caller — await agent_runner.invoke(config, messages, stream=...)
            agent_context: Tool resolver — await agent_context.tool_caller.dispatch(name, args)
            context: Step input — messages, stream flag, run_id count, state_data

        Returns:
            StepResult with status + updated messages + optional output.
            On error, set status=StepStatus.ERROR and error="reason" (not metadata["error"]).
            To pause for human input, set status=StepStatus.HITL and hitl_actions=[...];
            see agent_sdk.langgraph for a full worked example (LangGraph interrupt()).
        """
        ...


def _inject_system_prompt(
    messages: list[AnyMessage],
    agent_runner: "AgentRunner",
) -> list[AnyMessage]:
    """
    Prepend the AgentProfile.system_prompt as a SystemMessage if:
      1. agent_runner has an agent_profile with system_prompt set, AND
      2. The message list has no existing SystemMessage.
    Returns the (possibly updated) message list.
    """
    profile = getattr(agent_runner, "agent_profile", None)
    if profile is None or not profile.system_prompt:
        return messages
    if any(getattr(m, "role", None) == "system" for m in messages):
        return messages
    return [SystemMessage(content=profile.system_prompt)] + list(messages)


class DefaultExecutionStep(ExecutionStep):
    """
    Standard single-turn execution step (no tool calls).

    Calls the runner with its default_config, appends the assistant message,
    and returns COMPLETE.

    If the AgentProfile has a system_prompt set and the message list does not
    already contain a system message, it is injected automatically.

    Use ReActExecutionStep for agents that need tool calls.
    """

    async def run(
        self,
        agent_runner: "AgentRunner",
        agent_context: "AgentContext",
        context: StepContext,
    ) -> StepResult:
        messages = _inject_system_prompt(list(context.messages), agent_runner)

        response = await agent_runner.invoke(
            config=agent_runner.default_config,
            stream=context.stream,
            messages=messages,
        )

        updated_messages = messages + [response.to_assistant_message()]

        return StepResult(
            status=StepStatus.COMPLETE,
            messages=updated_messages,
            output=response.content,
            metadata={"run_id": context.run_id},
        )


class ReActExecutionStep(ExecutionStep):
    """
    Built-in ReAct tool-loop execution step.

    Implements the standard pattern:
        1. Call LLM
        2. If LLM returns tool calls → dispatch them → loop
        3. If LLM returns no tool calls → complete

    Automatically injects AgentProfile.system_prompt if set and not already present.

    Args:
        max_tool_rounds: Maximum number of LLM→tool-dispatch cycles per step (default 10).
                         Prevents infinite loops if the LLM keeps requesting tools.

    Example::

        from agent_sdk import create_agent, ReActExecutionStep

        return create_agent(
            agent_id="my-agent",
            agent_profile=my_profile,
            tools=[SearchTool(), CalcTool()],
            execution_step=ReActExecutionStep(max_tool_rounds=5),
        )
    """

    def __init__(self, max_tool_rounds: int = 10) -> None:
        self.max_tool_rounds = max_tool_rounds

    async def run(
        self,
        agent_runner: "AgentRunner",
        agent_context: "AgentContext",
        context: StepContext,
    ) -> StepResult:
        messages = _inject_system_prompt(list(context.messages), agent_runner)

        for _ in range(self.max_tool_rounds):
            response = await agent_runner.invoke(
                config=agent_runner.default_config,
                stream=context.stream,
                messages=messages,
            )

            # Append assistant message (handles tool_calls automatically)
            messages = messages + [response.to_assistant_message()]

            if not response.tool_calls:
                # No tool calls → done
                return StepResult(
                    status=StepStatus.COMPLETE,
                    messages=messages,
                    output=response.content,
                    metadata={"run_id": context.run_id},
                )

            # Dispatch all tool calls and append results
            for tc in response.tool_calls:
                tool_response = await agent_context.tool_caller.dispatch(
                    tc.name, tc.arguments
                )
                messages = messages + [
                    ToolCallMessage(
                        tool_call_id=tc.id,
                        name=tc.name,
                        content=tool_response.content,
                    )
                ]

        # Hit max_tool_rounds — return CONTINUE to let Engine decide
        return StepResult(
            status=StepStatus.CONTINUE,
            messages=messages,
            metadata={
                "run_id": context.run_id,
                "reason": f"max_tool_rounds ({self.max_tool_rounds}) reached",
            },
        )
