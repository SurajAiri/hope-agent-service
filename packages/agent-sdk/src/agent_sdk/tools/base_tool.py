"""
agent_sdk.tools.base_tool
~~~~~~~~~~~~~~~~~~~~~~~~~
BaseTool — abstract base for all tools in the Agent SDK.
ToolResult — structured success/error envelope returned by every tool.

Design rules (non-negotiable):
  - All concrete tools extend BaseTool and define the three ClassVars:
      name            (str)       — unique identifier used for lookup
      description     (str)       — shown to the LLM for tool selection
      parameters_model (type[BaseModel]) — schema + validation in one place
  - `execute(**kwargs)` is the public entry point.  It validates kwargs via
    parameters_model, then delegates to `_execute(params)`.
  - `_execute` receives an already-validated Pydantic model — no raw dict juggling.
  - `to_openai_schema()` emits a standard OpenAI function-calling dict so
    ToolCaller can hand schemas to the LLM without any extra glue.
  - `timeout` and `dangerous` are class-level constants:
      timeout   — seconds before ToolRegistry.dispatch() times out (default 30s)
      dangerous — marks tools with irreversible side-effects (email, charge, delete…)
                  ToolRegistry blocks dangerous tools from concurrent dispatch by default.
  - `cost_per_call` — flat cost per invocation (default 0.0).
      ToolCaller reads this ClassVar in _calc_cost to report billing.
      Set this on your tool class to declare a per-call fee (e.g. an external API charge).

Pydantic is used for ToolResult.  BaseTool itself is a plain ABC — it holds no
instance state, only ClassVars.
"""
from __future__ import annotations

import inspect
from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    """
    Structured result returned by every BaseTool execution.

    Use the class-method constructors rather than building this manually:
        ToolResult.ok(output="done", data={...}, metadata={...})
        ToolResult.fail(error="something went wrong")

    Fields:
        success:  True on success, False on failure.
        output:   String representation — shown to the LLM.
        data:     Optional structured output for programmatic use.
                  Callers can read this without re-parsing output.
        error:    Error message on failure (None on success).
        metadata: Free-form metadata (not shown to LLM).
    """

    success: bool
    output: str
    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def ok(
        cls,
        output: str,
        data: Any = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ToolResult":
        """Build a successful result."""
        return cls(success=True, output=output, data=data, metadata=metadata or {})

    @classmethod
    def fail(
        cls,
        error: str,
        metadata: dict[str, Any] | None = None,
    ) -> "ToolResult":
        """Build a failure result.  output is set to 'ERROR: <error>'."""
        return cls(
            success=False,
            output=f"ERROR: {error}",
            error=error,
            metadata=metadata or {},
        )


class BaseTool(ABC):
    """
    Abstract base for all tools.

    Concrete tools must define these ClassVars:
        name             — unique tool name (used as registry key)
        description      — human-readable, shown to LLM during tool selection
        parameters_model — Pydantic model; schema + validation in one declaration

    Optional ClassVar overrides:
        timeout      (float) — per-tool execution timeout in seconds (default 30.0)
        dangerous    (bool)  — marks irreversible side-effects; blocks concurrent
                               dispatch in ToolRegistry unless allow_dangerous=True
        cost_per_call (float) — flat cost per invocation (default 0.0).
                               ToolCaller reads this for billing.

    Example::

        class MyParams(BaseModel):
            query: str = Field(..., description="Search query")
            max_results: int = Field(5, ge=1, le=20)

        class MyTool(BaseTool):
            name             = "my_tool"
            description      = "Does something useful."
            parameters_model = MyParams
            timeout          = 15.0
            cost_per_call    = 0.001  # $0.001 per call

            async def _execute(self, params: MyParams) -> ToolResult:
                ...
                return ToolResult.ok(output="result here", data={"key": "value"})
    """

    name: ClassVar[str]
    description: ClassVar[str]

    # ClassVar, not @property — class-level constant, not computed per instance.
    # Subclass just declares:  parameters_model = MyParams
    parameters_model: ClassVar[type[BaseModel]]

    timeout: ClassVar[float] = 30.0

    # Marks tools with irreversible side effects (send_email, charge_card, delete_file…).
    # ToolRegistry uses this to block concurrent dispatch unless explicitly opted in.
    dangerous: ClassVar[bool] = False

    # Flat cost per invocation. 0.0 = free (default).
    # ToolCaller reads this in _calc_cost for billing. Set on your tool class to
    # declare a per-call fee (e.g. a paid external API).
    cost_per_call: ClassVar[float] = 0.0

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)

        # inspect.isabstract() is reliable across multi-level hierarchies.
        # Checking ABC in cls.__bases__ was fragile for intermediate abstract classes.
        if inspect.isabstract(cls):
            return

        missing = [
            attr
            for attr in ("name", "description", "parameters_model")
            if not getattr(cls, attr, None)
        ]
        if missing:
            raise TypeError(
                f"{cls.__name__} must define ClassVar(s): {', '.join(missing)}"
            )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def execute(self, **kwargs: Any) -> ToolResult:
        """
        Public entry point called by ToolRegistry.dispatch().
        Validates input via parameters_model, then delegates to _execute().
        Returns ToolResult.fail() on validation error — never raises.
        """
        try:
            params = self.parameters_model(**kwargs)
        except Exception as exc:
            return ToolResult.fail(
                f"Invalid arguments for '{self.name}': {exc}",
                metadata={"raw_kwargs": kwargs},
            )
        return await self._execute(params)

    @abstractmethod
    async def _execute(self, params: BaseModel) -> ToolResult:
        """
        Implement tool logic here.  params is already validated by parameters_model.
        Must return a ToolResult (use ToolResult.ok / ToolResult.fail).
        """
        ...

    # ------------------------------------------------------------------
    # Schema export
    # ------------------------------------------------------------------

    def _parameters_schema(self) -> dict[str, Any]:
        schema = self.parameters_model.model_json_schema()
        schema.pop("title", None)
        return schema

    def to_openai_schema(self) -> dict[str, Any]:
        """
        Return an OpenAI-compatible function-calling schema dict.
        ToolCaller passes these to the LLM so it knows what tools are available.
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self._parameters_schema(),
            },
        }
