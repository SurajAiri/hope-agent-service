"""
agent_sdk.tool_caller
~~~~~~~~~~~~~~~~~~~~~
Backward-compatibility shim.

All tool types have moved to agent_sdk.tools:
    from agent_sdk.tools import BaseTool, ToolResult, ToolRegistry, ToolCallConfig, ToolCaller

This module re-exports them so that existing code importing from agent_sdk.tool_caller
continues to work without modification.

MIGRATION GUIDE
---------------
Old import                              → New import
──────────────────────────────────────────────────────────────────────────────
from agent_sdk.tool_caller import Tool          → from agent_sdk import BaseTool
from agent_sdk.tool_caller import ToolCaller    → from agent_sdk import ToolCaller
from agent_sdk.tool_caller import ToolCallConfig→ from agent_sdk import ToolCallConfig

Old ToolCallConfig field:                  New field:
    tool_input=<any>                   →   tool_args={"param": value, ...}

Old Tool ABC:
    @property name(...)                →   name: ClassVar[str]
    @property description(...)         →   description: ClassVar[str]
    def run(tool_input)                →   async def _execute(params: MyParamsModel)
    (no schema export)                 →   parameters_model: ClassVar[type[BaseModel]]
"""

from __future__ import annotations

from agent_sdk.tools.base_tool import BaseTool, ToolResult  # noqa: F401

# BaseTool replaces the old lightweight Tool ABC.
# All existing subclasses should migrate to BaseTool.
from agent_sdk.tools.base_tool import BaseTool as Tool  # noqa: F401
from agent_sdk.tools.caller import ToolCallConfig, ToolCaller  # noqa: F401
from agent_sdk.tools.registry import ToolRegistry  # noqa: F401

__all__ = [
    "Tool",  # legacy alias → BaseTool
    "BaseTool",
    "ToolResult",
    "ToolRegistry",
    "ToolCallConfig",
    "ToolCaller",
]
