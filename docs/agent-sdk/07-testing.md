# 07 — Testing

The SDK ships with built-in test utilities that let you test your agent logic **without real LLMs, real databases, or real infrastructure**.

All utilities are in `agent_sdk.testing`:

```python
from agent_sdk.testing import (
    MockAgentRunner,
    MockToolCaller,
    make_step_context,
    make_agent_context,
)
```

---

## `MockAgentRunner`

A fake `AgentRunner` that returns preset string responses in sequence. Useful for testing your `ExecutionStep` without a live LLM.

```python
from agent_sdk.testing import MockAgentRunner

runner = MockAgentRunner(responses=["Hello!", "How can I help?"])
# First invoke  → AgentResponse(content="Hello!")
# Second invoke → AgentResponse(content="How can I help?")
# Third invoke  → AgentResponse(content="Hello!")  — cycles back
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `responses` | `list[str]` | required | Response strings to cycle through |
| `agent_profile` | `AgentProfile \| None` | minimal profile | Optional profile with LLM presets |
| `tool_schemas` | `list[dict] \| None` | `[]` | Tool schemas to include in context |

---

## `MockToolCaller`

A fake `ToolCaller` that returns preset results by tool name. No real tool execution — just preset responses.

```python
from agent_sdk.testing import MockToolCaller
from agent_sdk.tools import ToolResult

tool_caller = MockToolCaller(results={
    "web_search": "Found 3 results about Python.",
    "calculate":  ToolResult.ok(output="42", data={"result": 42}),
})

response = await tool_caller.dispatch("web_search", {"query": "Python"})
# response.content == "Found 3 results about Python."

response = await tool_caller.dispatch("calculate", {"expression": "6 * 7"})
# response.content == "42"
```

String values are automatically wrapped in `ToolResult.ok(output=value)`.

Calling a tool that has no preset returns a `ToolResult.fail()` response — no exception raised.

---

## `make_step_context`

Build a `StepContext` for testing — no Engine or Runner needed.

```python
from agent_sdk.testing import make_step_context
from agent_sdk.messages import HumanMessage

ctx = make_step_context(
    messages=[HumanMessage(content="What is 2 + 2?")],
    stream=False,
    run_id=1,
    state_data={"counter": 0},
)
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `messages` | `list[AnyMessage] \| None` | `[HumanMessage("test")]` | Input messages |
| `stream` | `bool` | `False` | Simulate streaming mode |
| `run_id` | `int` | `1` | Loop run count |
| `state_data` | `dict \| None` | `{}` | Arbitrary checkpoint state |

---

## `make_agent_context`

Build an `AgentContext` for testing, with either real tools or mock results.

```python
from agent_sdk.testing import make_agent_context

# With mock tool results (no real tool execution)
ctx = make_agent_context(results={"search": "found something useful"})

# With real tool instances
ctx = make_agent_context(tools=[WebSearchTool()])

# Empty (no tools)
ctx = make_agent_context()
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tools` | `list[BaseTool] \| None` | `[]` | Real tool instances |
| `results` | `dict[str, ToolResult \| str] \| None` | `None` | Mock results — overrides `tools` if set |

---

## Testing an `ExecutionStep`

The most common test: verify that your step behaves correctly for different LLM responses.

```python
import pytest
from agent_sdk.testing import MockAgentRunner, make_step_context, make_agent_context
from agent_sdk.execution_step import StepStatus
from agent_sdk.messages import HumanMessage
from my_agents.my_step import MyCustomStep

@pytest.mark.asyncio
async def test_my_step_returns_complete():
    runner = MockAgentRunner(responses=["The answer is 42."])
    ctx = make_step_context(messages=[HumanMessage(content="What is the answer?")])
    agent_ctx = make_agent_context()

    result = await MyCustomStep().run(runner, agent_ctx, ctx)

    assert result.status == StepStatus.COMPLETE
    assert result.output == "The answer is 42."
    assert len(result.messages) == 2  # input + assistant reply
```

---

## Testing a step with tool calls

```python
import pytest
from agent_sdk.testing import MockAgentRunner, make_step_context, make_agent_context
from agent_sdk.execution_step import StepStatus, ReActExecutionStep
from agent_sdk.messages import HumanMessage
from agent_sdk.types import ToolCall

@pytest.mark.asyncio
async def test_react_step_with_tool():
    # First call: LLM requests tool, second call: LLM gives final answer
    runner = MockAgentRunner(responses=["Let me search for that.", "Here is the result."])
    # But we need the first response to have tool_calls...
    # Use a custom MockAgentRunner subclass for tool-call scenarios, or test
    # DefaultExecutionStep/ReActExecutionStep separately from your tool logic.

    ctx = make_step_context(messages=[HumanMessage(content="Find me something.")])
    agent_ctx = make_agent_context(results={"web_search": "Found 5 articles."})

    result = await ReActExecutionStep().run(runner, agent_ctx, ctx)
    assert result.status in (StepStatus.COMPLETE, StepStatus.CONTINUE)
```

---

## Testing a tool directly

You don't need any runner or step infrastructure to test a tool:

```python
import pytest
from my_agents.tools import WebSearchTool

@pytest.mark.asyncio
async def test_web_search_tool():
    tool = WebSearchTool()
    result = await tool.execute(query="Python asyncio", max_results=3)

    assert result.success
    assert "Python" in result.output
    assert result.data is not None
```

`BaseTool.execute()` validates input via `parameters_model` and delegates to `_execute()`. Test it directly — no mocking needed.

---

## Testing an agent factory

```python
from my_agents.my_agent import my_agent_factory
from agent_sdk.execution_step import StepStatus
from agent_sdk.testing import make_step_context
from agent_sdk.messages import HumanMessage

def test_factory_creates_valid_agent():
    agent = my_agent_factory("my-agent")

    assert agent.agent_id == "my-agent"
    assert agent.runner is not None
    assert agent.execution_step is not None

@pytest.mark.asyncio
async def test_factory_agent_runs():
    agent = my_agent_factory("my-agent")
    ctx = make_step_context(messages=[HumanMessage(content="hello")])

    # Run the step directly (no runner infrastructure needed)
    result = await agent.execution_step.run(
        agent.runner, agent.agent_context, ctx
    )

    assert result.status == StepStatus.COMPLETE
```

> **Note:** If your `AgentRunner` uses a real LLM (e.g. `LitellmAgentRunner`), running the step in a test will make a real API call. Use `MockAgentRunner` to avoid that.
