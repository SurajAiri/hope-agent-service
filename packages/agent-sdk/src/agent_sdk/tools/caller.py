"""
agent_sdk.tools.caller
~~~~~~~~~~~~~~~~~~~~~~
ToolCaller — executes tools.  Extends AgentCaller[ToolCallConfig].
ToolCallConfig — typed config for a single tool invocation.

Key design rules (from arch):
  - Tools live on ToolCaller, NOT on AgentContext.
  - ToolCaller only needs _do_invoke.  Default _do_stream from AgentCaller base
    wraps it as a single final chunk — no override needed.
  - ToolCaller is responsible for idempotency and deduplication of tool calls.
  - Layered tool resolution lives in AgentContext, not here.

ToolCallConfig extends CallerConfig:
  - resource_type is auto-set to "tool"
  - resource_id   is auto-set to tool_name
  This ensures UsageTracker.log() receives complete resource identity.

ToolCaller wraps a ToolRegistry internally.  AgentContext accesses tools via
resolve_tool() / all_tools() which delegate to ToolCaller's registry.

Tool call arguments flow:
    LLM returns tool_call → ExecutionStep parses → builds ToolCallConfig(
        tool_name="my_tool",
        tool_args={"param1": "value", ...},
    ) → agent_context.tool_caller.invoke(config) → ToolRegistry.dispatch()
    → BaseTool.execute(**tool_args) → ToolResult → AgentResponse
"""
from __future__ import annotations

from typing import Any

from pydantic import Field, model_validator

from agent_sdk.caller import AgentCaller
from agent_sdk.caller_config import CallerConfig
from agent_sdk.tools.base_tool import BaseTool, ToolResult
from agent_sdk.tools.registry import ToolRegistry
from agent_sdk.types import AgentResponse, CostResult, Usage


class ToolCallConfig(CallerConfig):
    """
    Config passed to ToolCaller.invoke() — which tool and what arguments.

    Extends CallerConfig so ToolCaller is fully typed as AgentCaller[ToolCallConfig].
    resource_type is auto-set to "tool"; resource_id is auto-set to tool_name.

    Fields:
        tool_name  — name of the tool to invoke (required, non-empty)
        tool_args  — keyword arguments passed to BaseTool.execute(**tool_args)
        extras     — free-form metadata forwarded to UsageRecord (optional)

    Usage::

        config = ToolCallConfig(
            tool_name="web_search",
            tool_args={"query": "latest news", "max_results": 5},
        )
        response = tool_caller.invoke(config)
    """

    tool_name: str = ""
    tool_args: dict[str, Any] = Field(default_factory=dict)
    extras: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _set_defaults(self) -> "ToolCallConfig":
        if not self.tool_name:
            raise ValueError("ToolCallConfig requires a non-empty 'tool_name'")
        # Auto-set resource identity for UsageTracker
        if not self.resource_type:
            self.resource_type = "tool"
        if not self.resource_id:
            self.resource_id = self.tool_name
        return self


class ToolCaller(AgentCaller[ToolCallConfig]):
    """
    Executes tools by name.  Tools live here, not on AgentContext.

    Typed as AgentCaller[ToolCallConfig]:
        _do_invoke receives a ToolCallConfig directly — no runtime isinstance check.
        Default _do_stream (from AgentCaller base) wraps _do_invoke as a single
        final StreamChunk — tool callers do NOT need to override _do_stream.

    Internal architecture:
        ToolCaller holds a ToolRegistry.
        ToolRegistry handles timeout enforcement, concurrent dispatch safety, and
        dangerous-tool blocking.
        ToolCaller bridges AgentCaller's invoke() → ToolRegistry.dispatch() →
        BaseTool.execute() and converts ToolResult → AgentResponse.

    Layered tool resolution (done by AgentContext, not here):
        Agent's ToolCaller  (checked first)
            ↓ not found
        Runner's ToolCaller (shared)
            ↓ not found
        None / raise KeyError

    Usage::

        tool_caller = ToolCaller(tools=[WebSearchTool(), SendEmailTool()])
        # Injected by Runner before trigger_session:
        #   tool_caller._usage_tracker = engine.usage_tracker
        #   tool_caller._streamer      = streamer

        config = ToolCallConfig(tool_name="web_search", tool_args={"query": "hi"})
        response = tool_caller.invoke(config)  # AgentCaller.invoke() → _do_invoke()
    """

    def __init__(self, tools: list[BaseTool] | None = None) -> None:
        self._registry = ToolRegistry(tools or [])

    # ------------------------------------------------------------------
    # Registry access — used by AgentContext for layered resolution
    # ------------------------------------------------------------------

    def get_tools(self) -> list[BaseTool]:
        """Return all registered tools."""
        return self._registry.all_tools()

    def has_tool(self, name: str) -> bool:
        """Return True if this ToolCaller has a tool with the given name."""
        return name in self._registry

    def get_tool(self, name: str) -> BaseTool | None:
        """Return the tool with the given name, or None."""
        return self._registry.get(name)

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        """
        Return OpenAI-compatible function-calling schemas for all registered tools.
        Pass these to the LLM so it knows what tools are available.
        """
        return self._registry.to_openai_schemas()

    def register(self, tool: BaseTool) -> None:
        """Register an additional tool at runtime."""
        self._registry.register(tool)

    # ------------------------------------------------------------------
    # AgentCaller contract — _do_invoke is the only required override
    # ------------------------------------------------------------------

    async def _do_invoke(self, config: ToolCallConfig, **kwargs: Any) -> AgentResponse:
        """
        Resolve the tool from config.tool_name, execute it with config.tool_args,
        and return an AgentResponse wrapping the ToolResult.

        Raises KeyError if the tool is not found — AgentContext's resolve_tool()
        handles layered lookup.  If _do_invoke is called directly on this ToolCaller,
        the caller is responsible for having checked has_tool() first.

        Directly awaits ToolRegistry.dispatch() — no thread-pool bridging needed
        since AgentCaller.invoke() is now fully async.
        """
        tool = self._registry.get(config.tool_name)
        if tool is None:
            raise KeyError(
                f"Tool '{config.tool_name}' not found in this ToolCaller. "
                f"Available: {self._registry.names()}"
            )

        result: ToolResult = await self._registry.dispatch(config.tool_name, config.tool_args)

        return AgentResponse(
            content=result.output,
            metadata={
                "tool_name": config.tool_name,
                "tool_args": config.tool_args,
                "success": result.success,
                "tool_error": result.error,
                "data": result.data,
                **result.metadata,
            },
        )

    # ------------------------------------------------------------------
    # Async dispatch — for callers that prefer async
    # ------------------------------------------------------------------

    async def dispatch(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
    ) -> AgentResponse:
        """
        Async entry point for tool execution.  Useful when the caller is already
        in an async context (e.g. an async ExecutionStep).

        Returns AgentResponse wrapping the ToolResult — same shape as invoke().
        """
        result = await self._registry.dispatch(tool_name, tool_args)
        return AgentResponse(
            content=result.output,
            metadata={
                "tool_name": tool_name,
                "tool_args": tool_args,
                "success": result.success,
                "tool_error": result.error,
                "data": result.data,
                **result.metadata,
            },
        )

    async def dispatch_many(
        self,
        calls: list[tuple[str, dict[str, Any]]],
        *,
        allow_dangerous: bool = False,
    ) -> list[AgentResponse]:
        """
        Concurrently dispatch multiple tool calls.
        Delegates to ToolRegistry.dispatch_many() for concurrent-safe execution.

        Args:
            calls:           List of (tool_name, tool_args) pairs.
            allow_dangerous: If False (default), raises on dangerous tools in batch.
        """
        results = await self._registry.dispatch_many(
            calls, allow_dangerous=allow_dangerous
        )
        return [
            AgentResponse(
                content=r.output,
                metadata={
                    "tool_name": name,
                    "tool_args": args,
                    "success": r.success,
                    "tool_error": r.error,
                    **r.metadata,
                },
            )
            for (name, args), r in zip(calls, results)
        ]


    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Cost calculation — reads BaseTool.cost_per_call ClassVar
    # ------------------------------------------------------------------

    def _calc_cost(
        self,
        config: ToolCallConfig,
        usage: Usage | None,
    ) -> CostResult | None:
        """
        Report billing for tool invocations.
        Reads BaseTool.cost_per_call ClassVar.
        Also honours config.cost_per_call for explicit per-call overrides.
        Returns None (no cost) when both are 0.0.
        """
        tool = self._registry.get(config.tool_name)
        tool_cost = tool.cost_per_call if tool is not None else 0.0
        # config.cost_per_call allows per-invocation override from ToolCallConfig
        effective_cost = max(config.cost_per_call, tool_cost)
        if effective_cost <= 0.0:
            return None
        return CostResult(credit_cost=effective_cost)

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._registry)

    def __repr__(self) -> str:
        return f"ToolCaller(tools={self._registry.names()})"
