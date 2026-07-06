# 02 — Defining Tools

Tools are callable functions that your agent can invoke during execution. The LLM sees their names, descriptions, and parameter schemas — and decides when to call them.

The SDK provides two ways to define tools:

| Approach | When to use |
|----------|-------------|
| [`@tool` decorator](#the-tool-decorator) | Simple async functions — fastest to write |
| [`BaseTool` class](#class-based-tools-basetool) | When you need instance state, inheritance, or precise control |

---

## The `@tool` Decorator

The `@tool` decorator wraps an `async` function into a `BaseTool` instance automatically. It infers the tool name, description, and parameter schema from the function signature and docstring.

### Basic usage

```python
from agent_sdk import tool

@tool
async def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    # your implementation
    return f"Sunny, 25°C in {city}"
```

The decorator creates a `BaseTool` instance and assigns it to `get_weather`. Pass it directly to `create_agent()`:

```python
create_agent(agent_id, agent_profile=PROFILE, tools=[get_weather])
```

### Adding parameter descriptions

Use `Annotated[T, "description"]` to add per-field descriptions that the LLM sees:

```python
from typing import Annotated
from agent_sdk import tool

@tool
async def web_search(
    query: Annotated[str, "The search query to look up"],
    max_results: Annotated[int, "Maximum number of results (1–10)"] = 5,
) -> str:
    """Search the web for current information."""
    results = await do_search(query, max_results)
    return "\n".join(results)
```

### Optional decorator parameters

```python
@tool(
    name="my_search",          # override tool name (default: function name)
    description="...",         # override description (default: first docstring line)
    dangerous=True,            # mark as irreversible — blocks concurrent dispatch
    timeout=15.0,              # execution timeout in seconds (default: 30.0)
    cost_per_call=0.001,       # flat cost per invocation for billing (default: 0.0)
)
async def my_search(query: str) -> str:
    """Search for something."""
    ...
```

### Return values

The decorated function can return:
- A plain string → wrapped in `ToolResult.ok(output=str)`
- A `ToolResult` directly → passed through as-is

```python
from agent_sdk import tool
from agent_sdk.tools import ToolResult

@tool
async def calculate(expression: str) -> ToolResult:
    """Evaluate a mathematical expression."""
    try:
        result = eval(expression)  # simplified — use a safe evaluator in production
        return ToolResult.ok(output=str(result), data={"result": result})
    except Exception as e:
        return ToolResult.fail(error=str(e))
```

> **Important:** The function **must be `async`**. Using a non-async function raises a `TypeError` immediately.

---

## Class-Based Tools (`BaseTool`)

For more control — instance state, inheritance, or precise parameter validation — extend `BaseTool`:

```python
from pydantic import BaseModel, Field
from agent_sdk.tools import BaseTool, ToolResult

# 1. Define the parameter schema
class SearchParams(BaseModel):
    query: str = Field(..., description="The search query")
    max_results: int = Field(5, ge=1, le=20, description="Number of results (1–20)")

# 2. Extend BaseTool
class WebSearchTool(BaseTool):
    name        = "web_search"
    description = "Search the web for current information."
    parameters_model = SearchParams
    timeout      = 15.0      # optional: seconds before timeout (default 30)
    dangerous    = False     # optional: blocks concurrent dispatch if True
    cost_per_call = 0.001   # optional: flat cost per call for billing

    async def _execute(self, params: SearchParams) -> ToolResult:
        # params is already validated — no raw dict juggling
        results = await do_search(params.query, params.max_results)
        return ToolResult.ok(
            output="\n".join(results),
            data={"count": len(results)},
        )
```

Instantiate and pass to the agent:

```python
create_agent(agent_id, agent_profile=PROFILE, tools=[WebSearchTool()])
```

### Required ClassVars

Every concrete `BaseTool` subclass must define:

| ClassVar | Type | Description |
|----------|------|-------------|
| `name` | `str` | Unique tool identifier — used as the dispatch key |
| `description` | `str` | Shown to the LLM for tool selection |
| `parameters_model` | `type[BaseModel]` | Pydantic model — schema + validation |

Missing any of these raises a `TypeError` at class definition time.

### Optional ClassVars

| ClassVar | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout` | `float` | `30.0` | Execution timeout in seconds |
| `dangerous` | `bool` | `False` | If `True`, blocks concurrent dispatch |
| `cost_per_call` | `float` | `0.0` | Flat cost charged per invocation |

### `ToolResult` — the structured return type

Always return `ToolResult` from `_execute`. Use the class-method constructors:

```python
# Success
ToolResult.ok(
    output="The result string shown to the LLM",
    data={"key": "structured data for programmatic use"},  # optional
    metadata={"timing_ms": 120},                           # optional, not shown to LLM
)

# Failure
ToolResult.fail(
    error="Something went wrong: ...",
    metadata={"raw_error": str(exc)},  # optional
)
```

The `output` field is what the LLM sees. `data` is for your code to read without re-parsing the string.

---

## Dangerous Tools

Mark a tool `dangerous=True` when it has **irreversible side effects** — sending emails, charging a card, deleting data.

```python
class SendEmailTool(BaseTool):
    name        = "send_email"
    description = "Send an email to a recipient."
    parameters_model = EmailParams
    dangerous   = True   # ← blocks concurrent dispatch
    ...
```

The `ToolRegistry` prevents dangerous tools from being dispatched concurrently. If the LLM calls a dangerous tool, no other dangerous tool can run at the same time.

---

## Providing Tools to the Agent

Tools are provided at agent creation time. The `AgentContext` wraps them internally:

```python
# Shorthand (most common) — pass directly to create_agent()
create_agent(agent_id, agent_profile=PROFILE, tools=[WebSearchTool(), CalcTool()])

# Manual — if you need to build AgentContext yourself
from agent_sdk import AgentContext
ctx = AgentContext(tools=[WebSearchTool(), CalcTool()])
```

The `ToolCaller` built into `AgentContext` handles:
- Dispatching by tool name
- Input validation via `parameters_model`
- Timeout enforcement
- Usage logging for billing
