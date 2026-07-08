# 04 — Execution Steps

An `ExecutionStep` defines **one run** of your agent's execution loop. The platform calls `step.run()` repeatedly until it receives `COMPLETE`, `ERROR`, `INTERRUPTED`, or `HITL` — or the run cap is hit.

This is your primary control surface: you decide how to call the LLM, when to invoke tools, and when the agent is done.

---

## The Three Options

| Step | When to use |
|------|-------------|
| [`DefaultExecutionStep`](#defaultexecutionstep) | Single-turn, no tools. LLM answers once and you're done. |
| [`ReActExecutionStep`](#reactexecutionstep) | Multi-turn tool loop. Built-in ReAct pattern: LLM → tools → LLM → … |
| [Custom `ExecutionStep`](#custom-execution-steps) | Full control — any pattern, any multi-step logic |

---

## `DefaultExecutionStep`

The simplest step. Calls the LLM once and returns `COMPLETE`.

```python
from agent_sdk import Agent, DefaultExecutionStep

def my_factory(agent_id: str) -> Agent:
    return Agent.create(
        agent_id,
        agent_profile=PROFILE,
        # execution_step defaults to DefaultExecutionStep() — no need to specify
    )
```

**What it does:**
1. Injects `AgentProfile.system_prompt` if set and no system message is present
2. Calls `agent_runner.invoke(config=default_config, messages=messages)`
3. Appends the assistant message
4. Returns `StepResult(status=COMPLETE, messages=..., output=response.content)`

Use this for simple Q&A agents or chatbots that don't need tools.

---

## `ReActExecutionStep`

The built-in **Reason + Act** loop. Handles the LLM-tool-LLM pattern automatically.

```python
from agent_sdk import Agent, ReActExecutionStep

def my_factory(agent_id: str) -> Agent:
    return Agent.create(
        agent_id,
        agent_profile=PROFILE,
        tools=[WebSearchTool(), CalcTool()],
        execution_step=ReActExecutionStep(max_tool_rounds=5),
    )
```

**What it does each run:**
1. Injects system prompt (if set and not present)
2. Calls the LLM
3. If the LLM returned tool calls → dispatches all of them → appends results → loops
4. If no tool calls → returns `COMPLETE`
5. If `max_tool_rounds` is reached → returns `CONTINUE` (loop runs again next run)

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_tool_rounds` | `int` | `10` | Max LLM→tool cycles per single run |

```python
ReActExecutionStep(max_tool_rounds=3)  # stop tool loop after 3 rounds per run
```

---

## Custom Execution Steps

For full control, extend `ExecutionStep` and implement `run()`:

```python
from agent_sdk.execution_step import ExecutionStep, StepContext, StepResult, StepStatus
from agent_sdk import AgentRunner, AgentContext

class MyCustomStep(ExecutionStep):
    async def run(
        self,
        agent_runner: AgentRunner,
        agent_context: AgentContext,
        context: StepContext,
    ) -> StepResult:
        # context.messages  — current conversation messages
        # context.stream    — True if SSE streaming is active
        # context.run_id — current loop run (1-indexed)
        # context.state_data — arbitrary checkpoint data (survives resume)

        response = await agent_runner.invoke(
            config=agent_runner.default_config,
            stream=context.stream,
            messages=context.messages,
        )

        updated = list(context.messages) + [response.to_assistant_message()]

        return StepResult(
            status=StepStatus.COMPLETE,
            messages=updated,
            output=response.content,
        )
```

---

## `StepContext` — What the step receives

The platform builds `StepContext` from its internal state and passes it to your `run()`:

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `list[AnyMessage]` | Current conversation history (input + all messages so far) |
| `stream` | `bool` | Whether SSE streaming is active |
| `run_id` | `int` | Current loop run (starts at 1) |
| `state_data` | `dict[str, Any]` | Arbitrary state persisted across iterations (read/write) |

Treat `context` as **read-only** except for `state_data` (see below).

---

## `StepResult` — What the step returns

Your step must return a `StepResult`:

```python
StepResult(
    status=StepStatus.COMPLETE,   # required — see below
    messages=[...],               # updated message list (required — always include all messages)
    output="final answer",        # result string (set on COMPLETE)
    error="reason",               # error description (set on ERROR)
    state_data={"key": "value"},  # optional — persisted to checkpoint
    metadata={...},               # optional — for observability, not used by platform
)
```

### `StepStatus` values

| Status | Effect |
|--------|--------|
| `COMPLETE` | Platform stores result, ends the loop, sets run status to `DONE` |
| `CONTINUE` | Platform loops again (next run) |
| `ERROR` | Platform stores `error`, ends the loop, sets run status to `FAIL` |
| `INTERRUPTED` | Platform pauses the run, sets status to `INTERRUPT` (resumable by simply re-triggering — no human action implied) |
| `HITL` | Platform pauses the run, sets status to `HITL`, persists `StepResult.hitl_actions` (see [06 — Resume & Lifecycle Hooks](06-resume-check.md)) |

```python
from agent_sdk.execution_step import StepStatus

# Done — return the result
return StepResult(status=StepStatus.COMPLETE, messages=messages, output=final_answer)

# Need another run
return StepResult(status=StepStatus.CONTINUE, messages=messages)

# Something went wrong
return StepResult(status=StepStatus.ERROR, messages=messages, error="Tool failed: ...")

# Pause, resumable by simply re-triggering (no human action needed)
return StepResult(status=StepStatus.INTERRUPTED, messages=messages)

# Pause for human input
return StepResult(status=StepStatus.HITL, messages=messages, hitl_actions=[{"id": "1", "value": {...}}])
```

---

## Calling the LLM Inside a Step

Use `agent_runner.invoke()` — the single public entry point for all LLM calls:

```python
response = await agent_runner.invoke(
    config=agent_runner.default_config,  # or profile.get_config("fast")
    stream=context.stream,
    messages=context.messages,
)
```

The `response` is an `AgentResponse`:

| Field | Type | Description |
|-------|------|-------------|
| `content` | `Any` | LLM response text |
| `tool_calls` | `list[ToolCall]` | Typed tool calls (pre-parsed — no `json.loads` needed) |
| `usage` | `Usage \| None` | Token counts |

### Converting to a message

```python
# Add the assistant reply to the message list — handles tool_calls automatically
messages = messages + [response.to_assistant_message()]
```

### Using multiple LLM configs

```python
# Use the "fast" model for a quick classification
config = agent_runner.agent_profile.get_config("fast")
classification = await agent_runner.invoke(config=config, messages=classify_messages)

# Use the "strong" model for the final answer
config = agent_runner.agent_profile.get_config("strong")
answer = await agent_runner.invoke(config=config, messages=context.messages)
```

---

## Dispatching Tools Manually

If you are writing a custom step and want to call tools yourself (instead of using `ReActExecutionStep`):

```python
from agent_sdk.messages import ToolCallMessage

for tc in response.tool_calls:
    tool_response = await agent_context.tool_caller.dispatch(tc.name, tc.arguments)
    messages = messages + [
        ToolCallMessage(
            tool_call_id=tc.id,
            name=tc.name,
            content=tool_response.content,
        )
    ]
```

`tc.arguments` is already a parsed `dict` — no `json.loads` needed.

---

## Persisting State Across Iterations

Use `context.state_data` to carry arbitrary data across loop iterations. The platform checkpoints it to Redis automatically.

```python
async def run(self, agent_runner, agent_context, context) -> StepResult:
    # Read state from previous run
    counter = context.state_data.get("counter", 0)
    counter += 1

    # ... do work ...

    return StepResult(
        status=StepStatus.CONTINUE if counter < 3 else StepStatus.COMPLETE,
        messages=messages,
        state_data={"counter": counter},  # persisted for the next run
    )
```

---

## Message Types

The SDK uses typed Pydantic message models throughout:

```python
from agent_sdk.messages import (
    SystemMessage,    # role="system"
    HumanMessage,     # role="user"
    AssistantMessage, # role="assistant"
    ToolCallMessage,  # role="tool"
    AnyMessage,       # Union of all four
    parse_message,    # parse a raw dict into the right type
)
```

Building messages manually:

```python
from agent_sdk.messages import SystemMessage, HumanMessage

messages = [
    SystemMessage(content="You are a helpful assistant."),
    HumanMessage(content="What is 2 + 2?"),
]
```
