"""
agent_sdk.agent_context
~~~~~~~~~~~~~~~~~~~~~~~~~~
AgentContext — aggregator. NOT an AgentCaller.

Key design rules (from arch):
  - AgentContext does NOT inherit from AgentCaller.
  - It holds references to caller children (ToolCaller, and V2: ConnectorCaller, RAGConnector, MemoryManager).
  - Tools belong to ToolCaller, not AgentContext.
  - Layered tool resolution: agent's AgentContext first, then parent (runner-level).

Hierarchy:
    Runner creates root AgentContext with shared tools.
    Agent creates its own AgentContext with agent-specific tools, parent=runner_cm.
    ToolCaller on each level owns its own tool registry. No shared mutation.

All tool types live in agent_sdk.tools (BaseTool, ToolResult, ToolRegistry, ToolCaller).
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent_sdk.tools.base_tool import BaseTool
    from agent_sdk.tools.caller import ToolCaller


class AgentContext:
    """
    Aggregator of all context-providing callers for an agent run.
    NOT an AgentCaller — does not implement invoke().

    Layered tool resolution:
        1. self.tool_caller (agent-specific)
        2. self.parent.tool_caller (runner-shared)
        3. None / raise KeyError

    V2 placeholders (not implemented):
        connector_caller: ConnectorCaller
        rag_connector: RAGConnector
        memory_manager: MemoryManager
    """

    def __init__(
        self,
        tool_caller: "ToolCaller | None" = None,
        tools: "list[BaseTool] | None" = None,
        parent: "AgentContext | None" = None,
    ) -> None:
        """
        Create an AgentContext.

        Args:
            tool_caller: Pre-built ToolCaller (advanced use — full control).
            tools:       List of BaseTool instances (convenience shorthand).
                         Creates a ToolCaller internally.
                         Ignored if tool_caller is also provided.
            parent:      Parent AgentContext for layered tool resolution.
                         Set to the Runner-level AgentContext for shared tools.

        Examples::

            # Shorthand (most common)
            ctx = AgentContext(tools=[SearchTool(), CalcTool()])

            # Pre-built ToolCaller (advanced)
            ctx = AgentContext(tool_caller=my_custom_caller)

            # No tools (pure LLM agent)
            ctx = AgentContext()
        """
        if tool_caller is None:
            from agent_sdk.tools.caller import ToolCaller as TC
            tool_caller = TC(tools=tools or [])
        self.tool_caller = tool_caller
        self.parent = parent

    def resolve_tool(self, name: str) -> "BaseTool":
        """
        Resolve a tool by name with layered lookup.
        Agent's ToolCaller takes priority over runner's.
        Raises KeyError if not found at any level.
        """
        if self.tool_caller.has_tool(name):
            return self.tool_caller.get_tool(name)  # type: ignore[return-value]
        if self.parent is not None:
            return self.parent.resolve_tool(name)
        raise KeyError(
            f"Tool '{name}' not found in this AgentContext or any parent."
        )

    def all_tools(self) -> list["BaseTool"]:
        """Return all tools visible from this context (own + parent, deduplicated, own takes priority)."""
        seen: dict[str, "BaseTool"] = {}
        # Parent first (lower priority)
        if self.parent is not None:
            for tool in self.parent.all_tools():
                seen[tool.name] = tool
        # Own tools override parent
        for tool in self.tool_caller.get_tools():
            seen[tool.name] = tool
        return list(seen.values())

    def get_tool_schemas(self) -> list[dict]:
        """Return OpenAI-compatible schemas for all tools visible from this context."""
        seen: dict[str, "BaseTool"] = {}
        if self.parent is not None:
            for tool in self.parent.all_tools():
                seen[tool.name] = tool
        for tool in self.tool_caller.get_tools():
            seen[tool.name] = tool
        return [t.to_openai_schema() for t in seen.values()]
