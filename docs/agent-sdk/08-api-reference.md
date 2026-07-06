# 08 — API Reference

Complete reference for all public classes and types in `agent_sdk`.

---

## Factories

### `create_agent()`

Full-featured agent factory. The recommended way to create agents.

```python
from agent_sdk import create_agent

create_agent(
    agent_id: str,
    agent_profile: AgentProfile,
    *,
    tools: list[BaseTool] | None = None,
    execution_step: ExecutionStep | None = None,
    resume_check: ResumeCheck | None = None,
    parent_context: AgentContext | None = None,
    metadata: dict[str, Any] | None = None,
) -> Agent
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `agent_id` | ✅ | — | Unique agent ID (must match registration key) |
| `agent_profile` | ✅ | — | `AgentProfile` with LLM config and settings |
| `tools` | ❌ | `[]` | Tool instances available to the agent |
| `execution_step` | ❌ | `DefaultExecutionStep()` | How the agent runs each run |
| `resume_check` | ❌ | no-op `ResumeCheck` | Lifecycle hooks |
| `parent_context` | ❌ | `None` | Parent `AgentContext` for shared tools |
| `metadata` | ❌ | `{}` | Free-form metadata dict |

---

### `create_simple_agent()`

Minimal factory. The only place in the SDK where `model` and `provider` are accepted directly.

```python
from agent_sdk import create_simple_agent

create_simple_agent(
    agent_id: str,
    model: str,
    provider: str,
    *,
    tools: list[BaseTool] | None = None,
    system_prompt: str | None = None,
    max_runs: int = 50,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> Agent
```

---

### `create_langgraph_agent()`

Factory for LangGraph `StateGraph`-backed agents (requires the `langgraph` extra). See [09 — LangGraph Support](09-langgraph.md) for the full guide.

```python
from agent_sdk.langgraph import create_langgraph_agent

create_langgraph_agent(
    agent_id: str,
    graph_builder: Callable[[], StateGraph],
    *,
    agent_profile: AgentProfile | None = None,
    max_runs: int = 50,
    system_prompt: str | None = None,
    tools: list[BaseTool] | None = None,
    input_adapter=..., output_adapter=..., new_messages_adapter=...,  # MessagesState-convention defaults
    resume_check: ResumeCheck | None = None,
) -> Agent
```

---

## Configuration

### `AgentProfile`

```python
from agent_sdk import AgentProfile

AgentProfile(
    agent_id: str,
    max_runs: int = 50,
    system_prompt: str | None = None,
    default_llm: LlmConfig | None = None,
    fallback_llm: LlmConfig | None = None,
    fast_llm: LlmConfig | None = None,
    strong_llm: LlmConfig | None = None,
    presets: dict[str, LlmConfig] = {},
)
```

#### Methods

```python
profile.get_config(slug: str) -> LlmConfig
```

Resolve a named preset. Slug → preset dict → `fallback_llm` → `ValueError`.

---

### `LlmConfig`

```python
from agent_sdk import LlmConfig

LlmConfig(
    model: str,
    provider: str,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    extras: dict = {},
    input_cost_per_token: float | None = None,
    output_cost_per_token: float | None = None,
)
```

---

## Agent Components

### `Agent`

Container for all agent components. Created by factory helpers or built manually.

```python
from agent_sdk import Agent

Agent(
    agent_id: str,
    runner: AgentRunner,
    agent_context: AgentContext,
    execution_step: ExecutionStep,
    resume_check: ResumeCheck | None = None,  # defaults to no-op
    metadata: dict[str, Any] = {},
)
```

#### Class method

```python
Agent.litellm(
    agent_id: str,
    agent_config: AgentProfile,
    agent_context: AgentContext,
    execution_step: ExecutionStep | None = None,
    resume_check: ResumeCheck | None = None,
    metadata: dict | None = None,
) -> Agent
```

---

### `AgentContext`

Aggregates tool callers for an agent. NOT a caller itself.

```python
from agent_sdk import AgentContext

AgentContext(
    tool_caller: ToolCaller | None = None,
    tools: list[BaseTool] | None = None,
    parent: AgentContext | None = None,
)
```

- Pass `tools=` for the shorthand path (creates `ToolCaller` internally)
- Pass `tool_caller=` for advanced use (pre-built caller)
- `parent` enables layered tool resolution (agent → runner → parent)

#### Methods

```python
agent_context.resolve_tool(name: str) -> BaseTool      # raises KeyError if not found
agent_context.all_tools() -> list[BaseTool]            # own + parent, deduplicated
agent_context.get_tool_schemas() -> list[dict]         # OpenAI-compatible schemas
```

---

### `AgentRunner` (ABC)

Abstract base for LLM callers. Extend this to build a custom runner.

```python
from agent_sdk import AgentRunner

class MyRunner(AgentRunner):
    @property
    def default_config(self) -> CallerConfig:
        return self.agent_profile.get_config("default")

    async def _do_invoke(self, config, **kwargs) -> AgentResponse:
        ...

    async def _do_stream(self, config, **kwargs):  # optional
        yield StreamChunk(...)
```

#### `LitellmAgentRunner`

The built-in runner backed by LiteLLM. Used by `create_agent()` and `create_simple_agent()` automatically.

```python
from agent_sdk import LitellmAgentRunner

runner = LitellmAgentRunner(agent_profile=my_profile)
```

---

## Tools

### `BaseTool` (ABC)

```python
from agent_sdk.tools import BaseTool, ToolResult
from pydantic import BaseModel

class MyParams(BaseModel):
    query: str

class MyTool(BaseTool):
    name             = "my_tool"
    description      = "Does something useful."
    parameters_model = MyParams
    timeout          = 30.0       # optional
    dangerous        = False      # optional
    cost_per_call    = 0.0        # optional

    async def _execute(self, params: MyParams) -> ToolResult:
        return ToolResult.ok(output="result")
```

#### Public method

```python
await tool.execute(**kwargs) -> ToolResult   # validates + dispatches to _execute
tool.to_openai_schema() -> dict              # OpenAI function-calling schema
```

---

### `ToolResult`

```python
from agent_sdk.tools import ToolResult

# Success
ToolResult.ok(
    output: str,
    data: Any = None,
    metadata: dict | None = None,
) -> ToolResult

# Failure
ToolResult.fail(
    error: str,
    metadata: dict | None = None,
) -> ToolResult
```

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `success` | `bool` | True on success |
| `output` | `str` | String shown to the LLM |
| `data` | `Any` | Structured data for programmatic access |
| `error` | `str \| None` | Error message on failure |
| `metadata` | `dict` | Not shown to LLM — for observability |

---

### `@tool` decorator

```python
from agent_sdk import tool

@tool
async def my_function(param: str) -> str:
    """Description."""
    ...

# With options
@tool(
    name="override_name",
    description="override description",
    dangerous=False,
    timeout=30.0,
    cost_per_call=0.0,
)
async def my_function(...):
    ...
```

---

### `ToolCaller`

Manages a set of tools and dispatches calls with timeout and safety enforcement.

```python
from agent_sdk.tools import ToolCaller

caller = ToolCaller(tools=[MyTool(), OtherTool()])
response = await caller.dispatch(tool_name, tool_args)  # returns AgentResponse
```

---

### `ToolRegistry`

Low-level tool registry (usually managed for you by `ToolCaller`).

```python
from agent_sdk.tools import ToolRegistry

registry = ToolRegistry()
registry.register(MyTool())
tool = registry.get("my_tool")
schemas = registry.get_all_schemas()
```

---

## Execution

### `ExecutionStep` (ABC)

```python
from agent_sdk.execution_step import ExecutionStep, StepContext, StepResult, StepStatus

class MyStep(ExecutionStep):
    async def run(
        self,
        agent_runner: AgentRunner,
        agent_context: AgentContext,
        context: StepContext,
    ) -> StepResult:
        ...
```

### `DefaultExecutionStep`

Single-turn step. Calls LLM once and returns `COMPLETE`. No tools.

```python
from agent_sdk import DefaultExecutionStep
step = DefaultExecutionStep()
```

### `ReActExecutionStep`

Built-in ReAct tool loop.

```python
from agent_sdk import ReActExecutionStep
step = ReActExecutionStep(max_tool_rounds=10)
```

### `StepContext`

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `list[AnyMessage]` | Current conversation messages |
| `stream` | `bool` | Streaming mode flag |
| `run_id` | `int` | Current run (1-indexed) |
| `state_data` | `dict[str, Any]` | Arbitrary checkpoint state |

### `StepResult`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `StepStatus` | `COMPLETE \| CONTINUE \| ERROR \| INTERRUPTED \| HITL` |
| `messages` | `list[AnyMessage]` | Updated message list |
| `output` | `Any` | Final result (on COMPLETE) |
| `error` | `str \| None` | Error message (on ERROR) |
| `state_data` | `dict \| None` | Persisted to checkpoint |
| `hitl_actions` | `list[dict] \| None` | Required on HITL — pending human actions, persisted by Engine |
| `metadata` | `dict` | Observability — not used by platform |

### `StepStatus`

```python
from agent_sdk.execution_step import StepStatus

StepStatus.COMPLETE     # "complete" — done, store result
StepStatus.CONTINUE     # "continue" — loop again
StepStatus.ERROR        # "error"    — fail the run
StepStatus.INTERRUPTED  # "interrupted" — pause the run, resumable by re-trigger
StepStatus.HITL         # "hitl"     — pause the run for human input, see hitl_actions
```

---

## Types

### `AgentResponse`

Returned by `agent_runner.invoke()`.

| Field | Type | Description |
|-------|------|-------------|
| `content` | `Any` | LLM response text |
| `tool_calls` | `list[ToolCall]` | Parsed tool calls (pre-parsed, no json.loads needed) |
| `usage` | `Usage \| None` | Token usage |
| `metadata` | `dict` | Provider-specific metadata |

```python
response.to_assistant_message() -> AssistantMessage
```

### `ToolCall`

Parsed tool call from the LLM. Populated in `AgentResponse.tool_calls`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Tool call ID (needed for `ToolCallMessage.tool_call_id`) |
| `name` | `str` | Tool name |
| `arguments` | `dict[str, Any]` | Already JSON-parsed arguments |

### `StreamChunk`

One SSE chunk in a streaming response.

| Field | Type | Description |
|-------|------|-------------|
| `content_delta` | `str` | New content in this chunk |
| `usage_delta` | `Usage \| None` | Token usage increment |
| `is_final` | `bool` | True on the last chunk |
| `metadata` | `dict` | Provider metadata |

### `Usage`

Token usage for one invoke.

```python
Usage(prompt_tokens=100, completion_tokens=50)
usage_a + usage_b  # supports addition
```

### `CostResult`

Result of a cost calculation.

| Field | Type | Description |
|-------|------|-------------|
| `credit_cost` | `float` | Calculated cost in credits |
| `version` | `str` | Cost function version |
| `breakdown` | `dict` | Per-resource breakdown |

---

## Webhook

Pass a `WebhookConfig` to `TriggerParams` (or the HTTP `webhook_config` field) to receive an async HTTP POST when a run completes.

### `WebhookConfig`

```python
from engine.types import WebhookConfig, WebhookSignatureConfig

WebhookConfig(
    url: str,
    headers: dict[str, str] = {},
    signature: WebhookSignatureConfig | None = None,
    max_retries: int = 0,    # 0 = best-effort, no retry (V1 only)
)
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | ✅ | — | Target HTTPS URL. Only `POST` is supported. |
| `headers` | ❌ | `{}` | Extra request headers sent with every call (e.g. `Authorization`). |
| `signature` | ❌ | `None` | HMAC signing config — see `WebhookSignatureConfig` below. |
| `max_retries` | ❌ | `0` | `0` = no retry (current default). `-1` = infinite (V2, not yet implemented). |

### `WebhookSignatureConfig`

```python
WebhookSignatureConfig(
    header_name: str,          # e.g. "X-Signature"
    secret: str,
    algorithm: Literal["sha256"] = "sha256",
)
```

When configured, the engine computes `HMAC-SHA256(secret, body)` over the JSON payload bytes and attaches it as:

```
<header_name>: sha256=<hex_digest>
```

### HTTP timeouts

```python
from engine.execution_manager import CONNECTION_TIMEOUT, REQUEST_TIMEOUT

CONNECTION_TIMEOUT = 5.0   # seconds — TCP connect
REQUEST_TIMEOUT    = 30.0  # seconds — full request (connect + transfer)
```

### Payload

The webhook body is always a JSON object:

```json
{
  "thread_id": "...",
  "session_id": "...",
  "status": "done",
  "timestamp": "2026-01-01T00:00:00+00:00"
}
```

### Usage example

```python
from engine.types import WebhookConfig, WebhookSignatureConfig

config = WebhookConfig(
    url="https://your-server.example.com/hooks/agent",
    headers={"Authorization": "Bearer <token>"},
    signature=WebhookSignatureConfig(
        header_name="X-Signature",
        secret="your-hmac-secret",
    ),
    max_retries=0,
)
```

Pass it to `TriggerParams.webhook_config` or include it as `webhook_config` in the HTTP request body.

---

## Messages

```python
from agent_sdk.messages import (
    Message,           # base
    SystemMessage,     # role="system"
    HumanMessage,      # role="user"
    AssistantMessage,  # role="assistant", tool_calls: list[dict] | None
    ToolCallMessage,   # role="tool", tool_call_id: str, name: str
    AnyMessage,        # Union of all four
    parse_message,     # parse raw dict to typed message
)
```

---

## Lifecycle

### `ResumeCheck`

```python
from agent_sdk import ResumeCheck, RunState

class MyResumeCheck(ResumeCheck):
    def hitl_action(self, state: RunState) -> bool: ...   # True=continue, False=wait
    def initial_work(self, state: RunState) -> None: ...  # first run only
    def resume_work(self, state: RunState) -> None: ...   # on checkpoint resume
    def before_run(self, state: RunState) -> None: ...    # always, before loop
```

### `RunState` (Protocol)

Read-only view of `ExecutionState` passed to `ResumeCheck` hooks.

Fields: `thread_id`, `session_id`, `org_id`, `agent_id`, `status`, `messages`, `run_id`, `max_runs`, `checkpoint_data`.

---

## Exceptions

### `AgentConfigurationError`

Raised when `AgentProfile` is missing required LLM configuration.

```python
from agent_sdk import AgentConfigurationError
```

---

## Deprecated

### `AgentConfig`

Deprecated alias for `AgentProfile`. Will be removed in a future release.

```python
# Old — still works but deprecated
from agent_sdk import AgentConfig

# New — preferred
from agent_sdk import AgentProfile
```

Migration guide: `AgentConfig` → `AgentProfile`. Field renames:

| Old field | New field |
|-----------|-----------|
| `high_llm` | `default_llm` (or `strong_llm`) |
| `low_llm` | `fast_llm` |
| `mid_llm` | `presets={"mid": ...}` |
| `extras` | `presets` |
