"""
agent_sdk.agent
~~~~~~~~~~~~~~~
Agent — container for all developer-provided agent components.

Instead of passing a raw tuple (AgentRunner, AgentContext, ResumeCheck, ExecutionStep)
through the system, everything is wrapped in a single Agent object.
Runner and Engine consume this object — clean, explicit, extensible.

Factory options (choose the right one for your use case):

1. Agent.litellm() — class method, full control (existing, unchanged)
   Requires: agent_config, agent_context wired manually.

2. create_agent() — module-level helper, full-featured with sensible defaults
   Requires: agent_id + agent_profile.
   Optional: tools, execution_step, resume_check, parent_context, metadata.
   Suitable for most agents.

3. create_simple_agent() — module-level helper, absolute minimum boilerplate
   Requires: agent_id + model + provider.
   Optional: tools, system_prompt, temperature, max_tokens.
   The ONLY place in the SDK where model/provider are accepted directly.
   Suitable for quick prototypes and single-turn agents.

Registration:
    def my_factory(agent_id: str) -> Agent:
        return create_agent(agent_id, agent_profile=MY_PROFILE, tools=[MyTool()])
    runner.register_agent("my-agent", my_factory)
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agent_sdk.resume_check import ResumeCheck

if TYPE_CHECKING:
    from agent_sdk.agent_context import AgentContext
    from agent_sdk.agent_profile import AgentProfile, LlmConfig
    from agent_sdk.agent_runner import AgentRunner
    from agent_sdk.execution_step import ExecutionStep
    from agent_sdk.tools.base_tool import BaseTool
else:
    AgentRunner = Any
    AgentContext = Any
    ExecutionStep = Any


class Agent(BaseModel):
    """
    Container for all components of one agent.

    Created by developer factory functions and registered with Runner.
    Runner and Engine use this object — it's the unit of agent identity.

    Fields:
        agent_id:        ID matching the registration key in Runner
        runner:          The AgentRunner (LLM caller) for this agent
        agent_context:   Tools, connectors, etc. for this agent
        execution_step:  One run of the execution loop (developer-written)
        resume_check:    Hooks for resume/HITL/initial/before-run logic (optional)
        metadata:        Developer-defined extra fields (tags, version, etc.)
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_id: str
    runner: AgentRunner
    agent_context: AgentContext
    execution_step: ExecutionStep
    resume_check: ResumeCheck | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _set_defaults(self) -> "Agent":
        if self.resume_check is None:
            self.resume_check = ResumeCheck()
        return self

    @classmethod
    def litellm(
        cls,
        agent_id: str,
        agent_config: "AgentProfile",
        agent_context: "AgentContext",
        execution_step: "ExecutionStep | None" = None,
        resume_check: ResumeCheck | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "Agent":
        """
        Build an Agent backed by LitellmAgentRunner.
        Use create_agent() for a more ergonomic API.
        """
        from agent_sdk.agent_runner.litellm_runner import LitellmAgentRunner
        from agent_sdk.execution_step import DefaultExecutionStep

        runner = LitellmAgentRunner(agent_config=agent_config)

        return cls(
            agent_id=agent_id,
            runner=runner,
            agent_context=agent_context,
            execution_step=execution_step or DefaultExecutionStep(),
            resume_check=resume_check,
            metadata=metadata or {},
        )


# ---------------------------------------------------------------------------
# Module-level factory helpers
# ---------------------------------------------------------------------------


def create_agent(
    agent_id: str,
    agent_profile: "AgentProfile",
    *,
    tools: "list[BaseTool] | None" = None,
    execution_step: "ExecutionStep | None" = None,
    resume_check: ResumeCheck | None = None,
    parent_context: "AgentContext | None" = None,
    metadata: dict[str, Any] | None = None,
) -> Agent:
    """
    Full-featured agent factory with sensible defaults.

    Requires agent_profile — maintains the multi-LLM design intent.
    Everything else is optional with good defaults.

    Args:
        agent_id:       Unique agent identifier (matches Runner registration key).
        agent_profile:  AgentProfile with LLM presets, max_runs, system_prompt.
        tools:          List of BaseTool instances. Defaults to empty.
        execution_step: Custom step. Defaults to DefaultExecutionStep (single-turn).
                        Pass ReActExecutionStep() for tool-loop agents.
        resume_check:   Custom resume/HITL hooks. Defaults to no-op ResumeCheck.
        parent_context: Parent AgentContext for layered tool resolution (usually None).
        metadata:       Free-form agent metadata dict.

    Example::

        from agent_sdk import create_agent, AgentProfile, LlmConfig, ReActExecutionStep

        PROFILE = AgentProfile(
            agent_id="my-agent",
            max_runs=15,
            system_prompt="You are a helpful assistant.",
            default_llm=LlmConfig(model="gpt-4o", provider="openai"),
            fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
        )

        def my_factory(agent_id: str) -> Agent:
            return create_agent(
                agent_id,
                agent_profile=PROFILE,
                tools=[SearchTool(), CalcTool()],
                execution_step=ReActExecutionStep(max_tool_rounds=5),
            )
    """
    from agent_sdk.agent_context import AgentContext

    agent_context = AgentContext(tools=tools or [], parent=parent_context)
    return Agent.litellm(
        agent_id=agent_id,
        agent_config=agent_profile,
        agent_context=agent_context,
        execution_step=execution_step,
        resume_check=resume_check,
        metadata=metadata or {},
    )


def create_simple_agent(
    agent_id: str,
    model: str,
    provider: str,
    *,
    tools: "list[BaseTool] | None" = None,
    system_prompt: str | None = None,
    max_runs: int = 50,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> Agent:
    """
    Absolute minimum boilerplate agent factory.

    The ONLY place in the SDK where model and provider are accepted directly,
    bypassing AgentProfile. Internally creates a minimal AgentProfile with a
    single fallback_llm. Use create_agent() when you need multiple LLM presets.

    Args:
        agent_id:       Unique agent identifier.
        model:          LiteLLM model string (e.g. "gpt-4o", "claude-3-5-sonnet-20241022").
        provider:       Provider name (e.g. "openai", "anthropic", "gemini").
        tools:          List of BaseTool instances (optional).
        system_prompt:  System prompt injected automatically by DefaultExecutionStep.
        max_runs: Max execution loop iterations (default 50).
        temperature:    Sampling temperature (default 0.7).
        max_tokens:     Max completion tokens (default 4096).

    Example::

        from agent_sdk import create_simple_agent

        def my_factory(agent_id: str) -> Agent:
            return create_simple_agent(
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
    return create_agent(agent_id=agent_id, agent_profile=profile, tools=tools)
