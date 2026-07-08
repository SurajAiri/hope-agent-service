"""
agent_sdk.agent
~~~~~~~~~~~~~~~
BaseAgent / Agent — the agent's entire lifecycle lives here, in one place.

Design rules (from arch discussion — these are load-bearing, don't casually
violate them when adding a new agent flavor):

  1. BaseAgent is the ONLY contract Engine and Runner depend on. Both touch
     exactly these fields/methods and nothing else:
         agent_id, runner, execution_step, resume_check, agent_context,
         metadata, validate_input(), __aenter__ / __aexit__
     Neither Engine nor Runner ever branches on "is this Agent or
     LangGraphAgent or SomeoneElsesAgent" — adding a third subclass costs
     zero changes to engine/runner code. If you find yourself wanting an
     `if isinstance(agent, ...)` in engine.py or runner.py, that's a sign
     the new behavior belongs on BaseAgent instead.

  2. Factories live ON the class, not as module-level functions:
         Agent.litellm()  — lowest-level, full manual control
         Agent.create()   — full-featured, sensible defaults (was create_agent())
         Agent.simple()   — minimum boilerplate (was create_simple_agent())
     Raw pydantic construction — Agent(agent_id=..., runner=..., ...) — is
     STILL fully legal and is genuinely needed: agents with a fully custom
     AgentRunner (e.g. fastapi_demo.agents.echo_agent.EchoAgentRunner) build
     the runner themselves and construct Agent(...) directly. The classmethods
     are convenience sugar on top of the constructor, not a locked gate.
     (create_agent() / create_simple_agent() / create_langgraph_agent() still
     exist as deprecated module-level shims that just call these classmethods
     — nothing already registered with Runner.register_agent() breaks.)

  3. validate_input() is the ONE seam for validating/reshaping
     TriggerParams.initial_state. Called by Engine exactly once, on the
     first run only, BEFORE anything touches checkpoint_data and BEFORE
     resume_check.initial_work() fires (see engine._run_resume_check).
     Two ways to customize, pick by how often it changes:
         - volatile: pass input_validator=MyValidator() (agent_sdk.input_validator)
         - stable:   subclass and override validate_input() directly
     resume_check stays what it always was — Engine-owned control flow for
     resume/HITL/interrupt handling. That's a SEPARATE concern from input
     validation; initial_work() keeps doing whatever else it did before
     (loading thread history, etc.), it just now receives already-validated
     data instead of the raw payload.

  4. __aenter__ / __aexit__ are scoped to ONE trigger_session() call — Runner
     wraps the call in `async with agent:`. This is NOT a hook that spans a
     whole HITL-paused logical session: Runner re-resolves a brand new Agent
     from the factory on every call, including a HITL resume that happens
     days later (see runner.Runner._resolve_agent — factories are called
     fresh, components are meant to be lightweight/stateless). Default is a
     no-op; override only if your runner opens something (an http client, a
     db connection) that should live for the duration of one run and then
     close.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field

from agent_sdk.input_validator import InputValidator, PassthroughInputValidator
from agent_sdk.resume_check import ResumeCheck

if TYPE_CHECKING:
    from agent_sdk.agent_context import AgentContext
    from agent_sdk.agent_profile import AgentProfile
    from agent_sdk.agent_runner import AgentRunner
    from agent_sdk.execution_step import ExecutionStep
    from agent_sdk.messages import AnyMessage
    from agent_sdk.tools.base_tool import BaseTool
else:
    AgentRunner = Any
    AgentContext = Any
    ExecutionStep = Any
    AnyMessage = Any


def _default_agent_context() -> "AgentContext":
    from agent_sdk.agent_context import AgentContext as _AgentContext

    return _AgentContext(tools=[])


def _default_execution_step() -> "ExecutionStep":
    from agent_sdk.execution_step import DefaultExecutionStep

    return DefaultExecutionStep()


class BaseAgent(BaseModel):
    """
    Abstract base. Instantiate Agent, LangGraphAgent, or your own subclass —
    never BaseAgent directly (enforced below, in __init__).

    No abc.ABC / abstractmethod here on purpose: every field has a usable
    default except `runner` (which pydantic already enforces as required at
    construction time), so there's no method that genuinely needs to be
    abstract. The __init__ guard is the whole enforcement mechanism.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_id: str
    runner: AgentRunner  # no default — required, real contract
    execution_step: ExecutionStep = Field(default_factory=_default_execution_step)
    resume_check: ResumeCheck = Field(default_factory=ResumeCheck)
    agent_context: AgentContext = Field(default_factory=_default_agent_context)
    input_validator: InputValidator = Field(default_factory=PassthroughInputValidator)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        if type(self) is BaseAgent:
            raise TypeError(
                "BaseAgent is abstract — instantiate Agent, LangGraphAgent, "
                "or your own BaseAgent subclass."
            )
        super().__init__(*args, **kwargs)

    # ------------------------------------------------------------------
    # Input validation — see module docstring, point 3
    # ------------------------------------------------------------------

    async def validate_input(
        self, messages: "list[AnyMessage]", initial_state: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Called once by Engine, first run only, before resume_check.initial_work().
        Default delegates to self.input_validator (the injectable knob — see
        agent_sdk.input_validator). Override this method directly instead if
        validation is intrinsic to this agent and not something you expect
        to swap independently.
        """
        return await self.input_validator.validate(messages, initial_state)

    # ------------------------------------------------------------------
    # Per-run resource lifecycle — see module docstring, point 4
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "BaseAgent":
        return self  # no-op default — override if you hold external resources

    async def __aexit__(self, *exc: Any) -> None:
        pass


class Agent(BaseAgent):
    """
    Plain default variant — same shape as today's Agent.litellm() / create_agent().
    """

    @classmethod
    def litellm(
        cls,
        agent_id: str,
        agent_profile: "AgentProfile",
        agent_context: "AgentContext | None" = None,
        execution_step: "ExecutionStep | None" = None,
        resume_check: ResumeCheck | None = None,
        input_validator: InputValidator | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "Agent":
        """
        Build an Agent backed by LitellmAgentRunner. Lowest-level factory —
        full manual control. Use Agent.create() for a more ergonomic API.
        """
        from agent_sdk.agent_context import AgentContext as _AgentContext
        from agent_sdk.agent_runner.litellm_runner import LitellmAgentRunner
        from agent_sdk.execution_step import DefaultExecutionStep

        runner = LitellmAgentRunner(agent_profile=agent_profile)

        kwargs: dict[str, Any] = dict(
            agent_id=agent_id,
            runner=runner,
            agent_context=agent_context or _AgentContext(tools=[]),
            execution_step=execution_step or DefaultExecutionStep(),
            metadata=metadata or {},
        )
        # Only pass these through if explicitly given — otherwise let the
        # pydantic field defaults on BaseAgent apply (ResumeCheck(),
        # PassthroughInputValidator()).
        if resume_check is not None:
            kwargs["resume_check"] = resume_check
        if input_validator is not None:
            kwargs["input_validator"] = input_validator
        return cls(**kwargs)

    @classmethod
    def create(
        cls,
        agent_id: str,
        agent_profile: "AgentProfile",
        *,
        tools: "list[BaseTool] | None" = None,
        execution_step: "ExecutionStep | None" = None,
        resume_check: ResumeCheck | None = None,
        input_validator: InputValidator | None = None,
        parent_context: "AgentContext | None" = None,
        metadata: dict[str, Any] | None = None,
    ) -> "Agent":
        """
        Full-featured agent factory with sensible defaults. Was the
        module-level create_agent() — same signature, now on the class.

        Requires agent_profile — maintains the multi-LLM design intent.
        Everything else is optional with good defaults.

        Example::

            from agent_sdk import Agent, AgentProfile, LlmConfig, ReActExecutionStep

            PROFILE = AgentProfile(
                agent_id="my-agent",
                max_runs=15,
                system_prompt="You are a helpful assistant.",
                default_llm=LlmConfig(model="gpt-4o", provider="openai"),
            )

            def my_factory(agent_id: str) -> Agent:
                return Agent.create(
                    agent_id,
                    agent_profile=PROFILE,
                    tools=[SearchTool(), CalcTool()],
                    execution_step=ReActExecutionStep(max_tool_rounds=5),
                )
        """
        from agent_sdk.agent_context import AgentContext as _AgentContext

        agent_context = _AgentContext(tools=tools or [], parent=parent_context)
        return cls.litellm(
            agent_id=agent_id,
            agent_profile=agent_profile,
            agent_context=agent_context,
            execution_step=execution_step,
            resume_check=resume_check,
            input_validator=input_validator,
            metadata=metadata or {},
        )

    @classmethod
    def simple(
        cls,
        agent_id: str,
        model: str,
        provider: str,
        *,
        tools: "list[BaseTool] | None" = None,
        system_prompt: str | None = None,
        max_runs: int = 50,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        input_validator: InputValidator | None = None,
    ) -> "Agent":
        """
        Absolute minimum boilerplate agent factory. Was the module-level
        create_simple_agent() — same signature, now on the class.

        The ONLY place in the SDK where model/provider are accepted directly,
        bypassing AgentProfile. Use Agent.create() when you need multiple LLM
        presets.

        Example::

            from agent_sdk import Agent

            def my_factory(agent_id: str) -> Agent:
                return Agent.simple(
                    agent_id,
                    model="gpt-4o",
                    provider="openai",
                    system_prompt="You are a helpful assistant.",
                    tools=[SearchTool()],
                )
        """
        from agent_sdk.agent_profile import AgentProfile, LlmConfig

        profile = AgentProfile(
            agent_id=agent_id,
            max_runs=max_runs,
            system_prompt=system_prompt,
            fallback_llm=LlmConfig(
                model=model,
                provider=provider,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
        )
        return cls.create(
            agent_id=agent_id,
            agent_profile=profile,
            tools=tools,
            input_validator=input_validator,
        )


# ---------------------------------------------------------------------------
# Deprecated module-level shims — back-compat only.
# Existing factory functions registered via runner.register_agent() that
# import these keep working unchanged; new code should call the classmethods
# above directly (Agent.create / Agent.simple / Agent.litellm).
# ---------------------------------------------------------------------------


def create_agent(agent_id: str, agent_profile: "AgentProfile", **kwargs: Any) -> Agent:
    """Deprecated — use Agent.create(...) instead."""
    return Agent.create(agent_id, agent_profile, **kwargs)


def create_simple_agent(agent_id: str, model: str, provider: str, **kwargs: Any) -> Agent:
    """Deprecated — use Agent.simple(...) instead."""
    return Agent.simple(agent_id, model, provider, **kwargs)
