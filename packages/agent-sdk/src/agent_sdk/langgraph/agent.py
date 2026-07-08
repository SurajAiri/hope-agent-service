"""
agent_sdk.langgraph.agent
~~~~~~~~~~~~~~~~~~~~~~~~~
LangGraphAgent — BaseAgent subclass wiring LangGraphAgentRunner +
LangGraphExecutionStep + LangGraphResumeCheck, mirroring Agent.create() /
Agent.simple() for pure-python agents. Same BaseAgent contract Engine/Runner
depend on (agent_id, runner, execution_step, resume_check, agent_context,
metadata, validate_input(), __aenter__/__aexit__) — nothing LangGraph-specific
leaks into engine/runner code, exactly like Agent.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

from agent_sdk.agent import BaseAgent
from agent_sdk.input_validator import InputValidator
from agent_sdk.langgraph.execution_step import LangGraphExecutionStep
from agent_sdk.langgraph.messages import (
    default_input_adapter,
    default_new_messages_adapter,
    default_output_adapter,
)
from agent_sdk.langgraph.resume_check import LangGraphResumeCheck
from agent_sdk.langgraph.runner import GraphBuilder, LangGraphAgentRunner

if TYPE_CHECKING:
    from agent_sdk.agent_context import AgentContext
    from agent_sdk.agent_profile import AgentProfile
    from agent_sdk.messages import AnyMessage
    from agent_sdk.resume_check import ResumeCheck
    from agent_sdk.tools.base_tool import BaseTool


class LangGraphAgent(BaseAgent):
    """
    BaseAgent subclass for LangGraph StateGraph-backed agents.
    Use LangGraphAgent.create(...) — same role/shape as Agent.create() for
    pure-python agents. Full HITL support via interrupt()/Command(resume=...)
    comes for free through LangGraphExecutionStep + LangGraphResumeCheck.
    """

    @classmethod
    def create(
        cls,
        agent_id: str,
        graph_builder: GraphBuilder,
        *,
        agent_profile: "AgentProfile | None" = None,
        max_runs: int = 50,
        system_prompt: str | None = None,
        tools: "list[BaseTool] | None" = None,
        input_adapter: "Callable[[list[AnyMessage]], dict[str, Any]]" = default_input_adapter,
        output_adapter: "Callable[[dict[str, Any]], Any]" = default_output_adapter,
        new_messages_adapter: "Callable[[int, dict[str, Any]], list[AnyMessage]]" = default_new_messages_adapter,
        resume_check: "ResumeCheck | None" = None,
        input_validator: InputValidator | None = None,
        parent_context: "AgentContext | None" = None,
        metadata: dict[str, Any] | None = None,
    ) -> "LangGraphAgent":
        """
        Build a LangGraphAgent from a StateGraph — same Runner/Engine
        contract as any pure-python agent (Agent.create() / Agent.simple()),
        including full HITL support.

        Args:
            agent_id:       Unique agent identifier (matches Runner registration key).
            graph_builder:  Zero-arg callable returning an UNCOMPILED StateGraph.
                            Called fresh on every run and compiled internally
                            with a checkpointer — do not call .compile() yourself.
            agent_profile:  Optional AgentProfile — only max_runs/system_prompt
                            matter here (LangGraph agents don't use LlmConfig
                            presets, the graph makes its own model calls). If
                            omitted, one is built from max_runs/system_prompt below.
            tools:          Tools exposed via agent_context.tool_caller — for
                            custom nodes that want to call through the
                            platform's tracked ToolCaller. NOT automatically
                            visible to the graph's own LLM calls; those are
                            your LangChain tools bound inside the graph itself.
            input_adapter / output_adapter / new_messages_adapter:
                            Override if your graph's state schema isn't the
                            MessagesState convention — see agent_sdk.langgraph.messages.
            resume_check:   Defaults to LangGraphResumeCheck() — handles the
                            interrupt/resume HITL flow. Override only for custom
                            HITL answer shapes (see LangGraphResumeCheck).
            input_validator: Optional injectable validator for
                            TriggerParams.initial_state — see agent_sdk.input_validator.
                            Independent of resume_check; runs once, first turn only.

        Example::

            from langgraph.graph import StateGraph, MessagesState, START, END
            from agent_sdk.langgraph import LangGraphAgent

            def build_graph() -> StateGraph:
                g = StateGraph(MessagesState)
                g.add_node("call_model", call_model)
                g.add_edge(START, "call_model")
                g.add_edge("call_model", END)
                return g

            def my_factory(agent_id: str) -> LangGraphAgent:
                return LangGraphAgent.create(agent_id, graph_builder=build_graph)

            runner.register_agent("my-langgraph-agent", my_factory)

        See docs/agent-sdk/09-langgraph.md for the full guide, including HITL.
        """
        from agent_sdk.agent_context import AgentContext
        from agent_sdk.agent_profile import AgentProfile

        profile = agent_profile or AgentProfile(
            agent_id=agent_id,
            max_runs=max_runs,
            system_prompt=system_prompt,
        )

        runner = LangGraphAgentRunner(
            graph_builder=graph_builder,
            agent_profile=profile,
            input_adapter=input_adapter,
            output_adapter=output_adapter,
            new_messages_adapter=new_messages_adapter,
        )
        agent_context = AgentContext(tools=tools or [], parent=parent_context)

        kwargs: dict[str, Any] = dict(
            agent_id=agent_id,
            runner=runner,
            agent_context=agent_context,
            execution_step=LangGraphExecutionStep(),
            resume_check=resume_check or LangGraphResumeCheck(),
            metadata=metadata or {},
        )
        if input_validator is not None:
            kwargs["input_validator"] = input_validator
        return cls(**kwargs)


# ---------------------------------------------------------------------------
# Deprecated module-level shim — back-compat only.
# ---------------------------------------------------------------------------


def create_langgraph_agent(
    agent_id: str, graph_builder: GraphBuilder, **kwargs: Any
) -> LangGraphAgent:
    """Deprecated — use LangGraphAgent.create(...) instead."""
    return LangGraphAgent.create(agent_id, graph_builder, **kwargs)
