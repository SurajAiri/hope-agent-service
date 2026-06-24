"""
agent_sdk.tools.registry
~~~~~~~~~~~~~~~~~~~~~~~~
ToolRegistry — manages tool registration and dispatches tool calls.

Design rules:
  - Tools are registered by name.  Duplicate registration logs a warning
    and overwrites the previous entry — explicit semantics.
  - dispatch()      — single tool, async, with per-tool timeout.
  - dispatch_many() — concurrent batch via asyncio.gather.
                      Dangerous tools (dangerous=True) are BLOCKED by default.
                      Pass allow_dangerous=True only after explicit ordering /
                      deduplication / user confirmation has been handled by the caller.
  - subset()        — returns a new ToolRegistry filtered to the allowed list.
                      None  → all tools (no restriction)
                      []    → empty registry (access denied)
                      [...] → only the named tools
  - to_openai_schemas() — list of OpenAI function-calling dicts (one per tool).

Why block dangerous tools in dispatch_many rather than warn?
    Warnings get ignored.  A concurrent charge_card + send_receipt where charge
    fails halfway is a real bug, not a log line.  Force the caller to be explicit.
"""
from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from agent_sdk.tools.base_tool import BaseTool, ToolResult


class ToolRegistry:
    """
    Registry of BaseTool instances, keyed by tool.name.

    Typical usage::

        registry = ToolRegistry(tools=[MyTool(), AnotherTool()])
        result = await registry.dispatch("my_tool", {"query": "hello"})
    """

    def __init__(self, tools: list[BaseTool] | None = None) -> None:
        self._tools: dict[str, BaseTool] = {}
        for tool in tools or []:
            self.register(tool)

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, tool: BaseTool) -> None:
        """Register a tool.  Overwrites an existing tool with the same name."""
        if tool.name in self._tools:
            logger.warning(
                "ToolRegistry: overwriting existing tool '{}'", tool.name
            )
        self._tools[tool.name] = tool

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, name: str) -> BaseTool | None:
        """Return the tool with the given name, or None."""
        return self._tools.get(name)

    def names(self) -> list[str]:
        """Return all registered tool names."""
        return list(self._tools.keys())

    def all_tools(self) -> list[BaseTool]:
        """Return all registered tools."""
        return list(self._tools.values())

    def subset(self, allowed: list[str] | None) -> "ToolRegistry":
        """
        Return a new ToolRegistry filtered to the allowed list.

        Semantics:
            None  → all tools, no restriction
            []    → empty registry, access denied
            [...] → only the named tools
        """
        if allowed is None:
            return ToolRegistry(list(self._tools.values()))
        return ToolRegistry(
            [t for n, t in self._tools.items() if n in allowed]
        )

    # ------------------------------------------------------------------
    # Schema export
    # ------------------------------------------------------------------

    def to_openai_schemas(self) -> list[dict[str, Any]]:
        """Return OpenAI-compatible function-call schemas for all registered tools."""
        return [tool.to_openai_schema() for tool in self._tools.values()]

    # ------------------------------------------------------------------
    # Dispatch — single tool
    # ------------------------------------------------------------------

    async def dispatch(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> ToolResult:
        """
        Execute a single tool by name with the given arguments.

        - Resolves the tool from the registry.
        - Enforces per-tool timeout via asyncio.wait_for.
        - Returns ToolResult.fail() on unknown tool, timeout, or unexpected error.
          Never raises — callers can inspect result.success.
        """
        tool = self.get(tool_name)

        if tool is None:
            return ToolResult.fail(
                f"Unknown tool '{tool_name}'. "
                f"Available: {self.names() or '(none registered)'}",
                metadata={"tool": tool_name},
            )

        try:
            logger.debug(
                "ToolRegistry: executing '{}' with args={}", tool_name, arguments
            )
            result = await asyncio.wait_for(
                tool.execute(**arguments),
                timeout=tool.timeout,
            )
            logger.debug(
                "ToolRegistry: '{}' finished | success={}", tool_name, result.success
            )
            return result

        except TimeoutError:
            logger.warning(
                "ToolRegistry: '{}' timed out after {}s", tool_name, tool.timeout
            )
            return ToolResult.fail(
                f"Tool '{tool_name}' timed out after {tool.timeout}s",
                metadata={"tool": tool_name, "timeout": tool.timeout},
            )

        except Exception as exc:
            logger.exception(
                "ToolRegistry: '{}' raised an unexpected error", tool_name
            )
            return ToolResult.fail(
                str(exc),
                metadata={"tool": tool_name, "error_type": type(exc).__name__},
            )

    # ------------------------------------------------------------------
    # Dispatch — concurrent batch
    # ------------------------------------------------------------------

    async def dispatch_many(
        self,
        calls: list[tuple[str, dict[str, Any]]],
        *,
        allow_dangerous: bool = False,
    ) -> list[ToolResult]:
        """
        Dispatch multiple tool calls concurrently via asyncio.gather.

        Safe (non-dangerous) tools run in parallel.
        Dangerous tools are BLOCKED by default — pass allow_dangerous=True only
        after the caller has handled ordering, deduplication, and idempotency.

        Args:
            calls:           List of (tool_name, arguments) pairs.
            allow_dangerous: If False (default), raises ValueError when any tool
                             in the batch is marked dangerous=True.

        Returns:
            List of ToolResult, one per call, in the same order as calls.
        """
        if not calls:
            return []

        if not allow_dangerous:
            dangerous = [
                name
                for name, _ in calls
                if (t := self.get(name)) and t.dangerous
            ]
            if dangerous:
                raise ValueError(
                    f"dispatch_many blocked: dangerous tools in batch: {dangerous}. "
                    "Dispatch them individually via dispatch(), or pass "
                    "allow_dangerous=True if you've handled ordering and idempotency."
                )

        return list(
            await asyncio.gather(
                *[self.dispatch(name, args) for name, args in calls]
            )
        )

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __repr__(self) -> str:
        return f"ToolRegistry(tools={self.names()})"
