"""
agent_sdk.decorators
~~~~~~~~~~~~~~~~~~~~
@tool — decorator for creating BaseTool instances from async functions.

The #1 friction point in the SDK was the boilerplate required to create a tool:
  1. Define a BaseModel params class
  2. Define a BaseTool subclass
  3. Set name, description, parameters_model ClassVars
  4. Implement async _execute(self, params) -> ToolResult

The @tool decorator collapses all of this to just the function:

    @tool
    async def web_search(query: Annotated[str, "Search query"], max_results: int = 5) -> str:
        \"\"\"Search the web for current information.\"\"\"
        results = await do_search(query, max_results)
        return results

What @tool infers automatically:
  - name:             from function name (snake_case, as-is)
  - description:      from the docstring (first non-empty line)
  - parameters_model: generated Pydantic model from type-annotated parameters
                      Annotated[T, "description"] sets the field description
  - ToolResult:       wraps the return value in ToolResult.ok() automatically
                      (if the function already returns ToolResult, wrap is skipped)

What @tool passes through to the tool class:
  - dangerous: ClassVar[bool] (default False) — set via @tool(dangerous=True)
  - timeout:   ClassVar[float] (default 30.0) — set via @tool(timeout=15.0)
  - cost_per_call: ClassVar[float] (default 0.0) — set via @tool(cost_per_call=0.001)

The decorated name is replaced with a BaseTool instance (not a function).
This means @tool decorated functions can be passed directly to ToolCaller or
AgentContext just like class-based tools:

    ctx = AgentContext(tools=[web_search, calc])  # ← @tool instances, not functions

See also: BaseTool (class-based tool definition for full control)
"""
from __future__ import annotations

import inspect
from typing import Annotated, Any, get_args, get_origin

from pydantic import BaseModel, Field, create_model

from agent_sdk.tools.base_tool import BaseTool, ToolResult


def _extract_param_field(annotation: Any, default: Any) -> tuple[Any, Any]:
    """
    Extract (actual_type, pydantic_Field) from a parameter annotation.
    Handles Annotated[T, "description string"] to populate Field(description=...).
    """
    field_description = ""
    actual_type = annotation

    if get_origin(annotation) is Annotated:
        args = get_args(annotation)
        actual_type = args[0]
        for extra in args[1:]:
            if isinstance(extra, str):
                field_description = extra
                break

    if default is inspect.Parameter.empty:
        return actual_type, Field(..., description=field_description)
    else:
        return actual_type, Field(default, description=field_description)


def _build_params_model(func: Any) -> type[BaseModel]:
    """
    Auto-generate a Pydantic BaseModel from a function's type-annotated parameters.
    Skips self, cls, *args, **kwargs.
    """
    sig = inspect.signature(func)

    # get_type_hints with include_extras=True preserves Annotated wrappers
    try:
        import typing
        hints = typing.get_type_hints(func, include_extras=True)
    except Exception:
        hints = {}

    fields: dict[str, tuple[Any, Any]] = {}
    for param_name, param in sig.parameters.items():
        if param_name in ("self", "cls"):
            continue
        if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            continue

        annotation = hints.get(param_name, Any)
        actual_type, field = _extract_param_field(annotation, param.default)
        fields[param_name] = (actual_type, field)

    # Model name: CamelCase + Params (e.g. web_search → WebSearchParams)
    model_name = "".join(w.title() for w in func.__name__.split("_")) + "Params"
    return create_model(model_name, **fields)


def _make_tool_class(
    func: Any,
    tool_name: str,
    tool_description: str,
    params_model: type[BaseModel],
    dangerous: bool,
    timeout: float,
    cost_per_call: float,
) -> type[BaseTool]:
    """
    Dynamically create a BaseTool subclass from a function.
    Uses type() so ABCMeta resolves __abstractmethods__ correctly.
    """

    async def _execute(self: BaseTool, params: BaseModel) -> ToolResult:
        result = await func(**params.model_dump())
        if isinstance(result, ToolResult):
            return result
        # Wrap plain return values in ToolResult.ok()
        return ToolResult.ok(output=str(result) if result is not None else "")

    tool_class_name = "".join(w.title() for w in func.__name__.split("_")) + "Tool"

    tool_class = type(
        tool_class_name,
        (BaseTool,),
        {
            # ClassVars — must satisfy BaseTool.__init_subclass__ validation
            "name": tool_name,
            "description": tool_description,
            "parameters_model": params_model,
            "timeout": timeout,
            "dangerous": dangerous,
            "cost_per_call": cost_per_call,
            # Abstract method override
            "_execute": _execute,
            # Preserve docstring
            "__doc__": func.__doc__,
            # Preserve module origin for debugging
            "__module__": func.__module__,
        },
    )
    return tool_class


def tool(
    _func: Any = None,
    *,
    name: str | None = None,
    description: str | None = None,
    dangerous: bool = False,
    timeout: float = 30.0,
    cost_per_call: float = 0.0,
) -> Any:
    """
    Decorator to create a BaseTool instance from an async function.

    Can be used with or without arguments:

        @tool
        async def my_tool(x: int) -> str:
            \"\"\"Does something.\"\"\"
            return str(x)

        @tool(dangerous=True, timeout=10.0, cost_per_call=0.001)
        async def dangerous_tool(query: Annotated[str, "Query"]) -> str:
            \"\"\"An expensive, irreversible operation.\"\"\"
            ...

    Args:
        name:          Override tool name (default: function name)
        description:   Override description (default: first docstring line)
        dangerous:     Mark as dangerous (blocks concurrent dispatch) [default: False]
        timeout:       Execution timeout in seconds [default: 30.0]
        cost_per_call: Flat cost per invocation [default: 0.0]

    Returns:
        A BaseTool instance that can be passed to ToolCaller or AgentContext.

    Note:
        The decorated name is replaced with a BaseTool instance (not a callable).
        This is intentional — pass it to ToolCaller(tools=[my_tool]) directly.
    """

    def decorator(func: Any) -> BaseTool:
        if not inspect.iscoroutinefunction(func):
            raise TypeError(
                f"@tool requires an async function. '{func.__name__}' is not async. "
                f"Change 'def {func.__name__}' to 'async def {func.__name__}'."
            )

        _name = name or func.__name__
        # Extract description from docstring (first non-empty line)
        doc = inspect.getdoc(func) or ""
        _description = description or (doc.split("\n")[0].strip() if doc else _name)

        if not _description:
            raise ValueError(
                f"@tool on '{func.__name__}': no description found. "
                "Add a docstring or pass description='...' to @tool."
            )

        params_model = _build_params_model(func)
        tool_class = _make_tool_class(
            func=func,
            tool_name=_name,
            tool_description=_description,
            params_model=params_model,
            dangerous=dangerous,
            timeout=timeout,
            cost_per_call=cost_per_call,
        )
        return tool_class()

    # Support both @tool and @tool(...) usage
    if _func is not None:
        return decorator(_func)
    return decorator
