"""
agent_sdk.testing
~~~~~~~~~~~~~~~~~
Test utilities for the Agent SDK.

Provides mock implementations and helpers for testing custom ExecutionStep
implementations, tool dispatch logic, and agent factories — without requiring
real infrastructure (LLM API, Redis, etc.).

No external test framework dependency — works with pytest, unittest, or standalone.

Exports:
    MockAgentRunner     — returns preset string responses, cycles on repeat calls
    MockToolCaller      — returns preset ToolResult/string results by tool name
    make_step_context   — build a StepContext for testing
    make_agent_context  — build an AgentContext with optional mock tools

Example::

    from agent_sdk.testing import MockAgentRunner, MockToolCaller, make_step_context, make_agent_context
    from agent_sdk.messages import HumanMessage

    async def test_my_step():
        runner = MockAgentRunner(responses=["Hello!", "Done."])
        ctx = make_step_context(messages=[HumanMessage(content="hi")])
        agent_ctx = make_agent_context(results={"search": "found something"})

        result = await MyExecutionStep().run(runner, agent_ctx, ctx)
        assert result.status == StepStatus.COMPLETE
        assert result.output == "Hello!"
"""
from __future__ import annotations

from typing import Any

from agent_sdk.agent_context import AgentContext
from agent_sdk.agent_profile import AgentProfile, LlmConfig
from agent_sdk.agent_runner.agent_runner import AgentRunner
from agent_sdk.caller_config import CallerConfig
from agent_sdk.execution_step import StepContext
from agent_sdk.messages import AnyMessage, HumanMessage
from agent_sdk.tools.base_tool import BaseTool, ToolResult
from agent_sdk.tools.caller import ToolCaller
from agent_sdk.tools.registry import ToolRegistry
from agent_sdk.types import AgentResponse


# ---------------------------------------------------------------------------
# MockAgentRunner
# ---------------------------------------------------------------------------


class MockAgentRunner(AgentRunner):
    """
    Mock AgentRunner that cycles through preset string responses.

    Useful for testing ExecutionStep implementations without a real LLM.

    Args:
        responses:     List of response strings. Cycles if called more times
                       than the list length.
        agent_profile: Optional AgentProfile. Defaults to a minimal profile.
        tool_schemas:  Optional list of OpenAI tool schemas to include in responses.

    Example::

        runner = MockAgentRunner(responses=["Step 1 done", "Step 2 done"])
        # First call  → AgentResponse(content="Step 1 done")
        # Second call → AgentResponse(content="Step 2 done")
        # Third call  → AgentResponse(content="Step 1 done")  (cycles)
    """

    def __init__(
        self,
        responses: list[str],
        agent_profile: AgentProfile | None = None,
        tool_schemas: list[dict[str, Any]] | None = None,
    ) -> None:
        _profile = agent_profile or AgentProfile(
            agent_id="mock",
            fallback_llm=LlmConfig(model="mock-model", provider="mock"),
        )
        super().__init__(agent_profile=_profile)
        self._responses = responses if responses else [""]
        self._tool_schemas = tool_schemas or []
        self._call_count = 0

    @property
    def default_config(self) -> CallerConfig:
        """No real LLM — return bare CallerConfig."""
        return CallerConfig()

    async def _do_invoke(
        self, config: Any, messages: list[AnyMessage], **kwargs: Any
    ) -> AgentResponse:
        idx = self._call_count % len(self._responses)
        self._call_count += 1
        return AgentResponse(
            content=self._responses[idx],
            metadata={"mock": True, "call_index": idx},
        )


# ---------------------------------------------------------------------------
# MockToolCaller
# ---------------------------------------------------------------------------


class MockToolCaller(ToolCaller):
    """
    Mock ToolCaller that returns preset results by tool name.

    Args:
        results: dict mapping tool_name → ToolResult | str.
                 String values are wrapped in ToolResult.ok(output=value).

    Example::

        tool_caller = MockToolCaller(results={
            "search": "Found 3 results",
            "calculate": ToolResult.ok(output="42", data={"result": 42}),
        })
        response = await tool_caller.dispatch("search", {"query": "foo"})
        assert response.content == "Found 3 results"
    """

    def __init__(self, results: dict[str, ToolResult | str] | None = None) -> None:
        # Pass empty registry — we bypass it in dispatch
        super().__init__(tools=[])
        self._mock_results: dict[str, ToolResult] = {}
        for name, result in (results or {}).items():
            if isinstance(result, str):
                self._mock_results[name] = ToolResult.ok(output=result)
            else:
                self._mock_results[name] = result

    async def dispatch(self, tool_name: str, tool_args: dict[str, Any]) -> AgentResponse:
        """Return preset result for tool_name, or a 'not mocked' response."""
        result = self._mock_results.get(tool_name)
        if result is None:
            result = ToolResult.fail(
                error=f"MockToolCaller: no preset result for tool '{tool_name}'",
                metadata={"available": list(self._mock_results.keys())},
            )
        return AgentResponse(
            content=result.output,
            metadata={
                "tool_name": tool_name,
                "tool_args": tool_args,
                "success": result.success,
                "tool_error": result.error,
                "data": result.data,
                "mock": True,
            },
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step_context(
    messages: list[AnyMessage] | None = None,
    stream: bool = False,
    run_id: int = 1,
    state_data: dict[str, Any] | None = None,
) -> StepContext:
    """
    Build a StepContext for testing.

    Args:
        messages:   Input messages. Defaults to [HumanMessage(content="test")].
        stream:     Whether to simulate streaming mode.
        run_id:  Loop run_id count (1-indexed).
        state_data: Arbitrary checkpoint data.

    Example::

        ctx = make_step_context(messages=[HumanMessage(content="what is 2+2?")])
    """
    return StepContext(
        messages=messages or [HumanMessage(content="test")],
        stream=stream,
        run_id=run_id,
        state_data=state_data or {},
    )


def make_agent_context(
    tools: list[BaseTool] | None = None,
    results: dict[str, ToolResult | str] | None = None,
) -> AgentContext:
    """
    Build an AgentContext for testing.

    Args:
        tools:   Real BaseTool instances. If provided, uses a real ToolCaller.
        results: Mock results dict (tool_name → ToolResult | str).
                 If provided, uses MockToolCaller (overrides tools=).

    Example::

        # With mock results
        ctx = make_agent_context(results={"search": "result"})

        # With real tools
        ctx = make_agent_context(tools=[MyTool()])
    """
    if results is not None:
        return AgentContext(tool_caller=MockToolCaller(results=results))
    return AgentContext(tools=tools or [])
