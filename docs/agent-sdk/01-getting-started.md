# 01 — Getting Started

This guide walks you from zero to a registered, running agent in a few minutes.

---

## Installation

The `agent-sdk` package is infrastructure-agnostic. Install it with the LiteLLM extra to get access to 100+ LLM providers:

```bash
pip install agent-sdk[litellm]
```

Or with uv (recommended for workspace-based projects):

```bash
uv add agent-sdk
uv add "agent-sdk[litellm]"
```

> **Note:** `litellm` is only needed if you are using `LitellmAgentRunner` (the default runner). If you build a completely custom `AgentRunner`, the base `agent-sdk` has no LLM dependencies.

---

## Your First Agent

Every agent is registered via a **factory function** — a callable `(agent_id: str) -> Agent`. The platform calls your factory fresh for each run.

### Option 1: Minimum boilerplate (`create_simple_agent`)

Use `create_simple_agent` when you just want a plain single-turn LLM agent with no tools and no special configuration.

```python
from agent_sdk import Agent, create_simple_agent

def my_agent_factory(agent_id: str) -> Agent:
    return create_simple_agent(
        agent_id,
        model="gpt-4o",
        provider="openai",
        system_prompt="You are a helpful assistant.",
    )
```

`create_simple_agent` is the **only** place in the SDK where `model` and `provider` are accepted directly. Internally it wraps them in an `AgentProfile` with a single `fallback_llm`.

---

### Option 2: Full control (`create_agent`)

Use `create_agent` when you need:

- Multiple LLM configurations (default, fast, strong)
- Custom tools
- A custom execution step (e.g., ReAct loop)
- Lifecycle hooks

```python
from agent_sdk import (
    Agent,
    AgentProfile,
    LlmConfig,
    ReActExecutionStep,
    create_agent,
    tool,
)
from typing import Annotated

# --- Define a tool ---
@tool
async def web_search(query: Annotated[str, "The search query"]) -> str:
    """Search the web for current information."""
    # your search implementation here
    return f"Results for: {query}"

# --- Configure the LLM ---
PROFILE = AgentProfile(
    agent_id="my-agent",
    max_runs=20,
    system_prompt="You are a helpful assistant. Use tools when needed.",
    default_llm=LlmConfig(model="gpt-4o", provider="openai"),
    fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
)

# --- Factory function ---
def my_agent_factory(agent_id: str) -> Agent:
    return create_agent(
        agent_id,
        agent_profile=PROFILE,
        tools=[web_search],
        execution_step=ReActExecutionStep(max_tool_rounds=5),
    )
```

---

## Registering Your Agent

In your FastAPI app (or any deployed runner), register the factory before the app starts serving requests:

```python
from runner.runner import Runner

runner = Runner()
await runner.setup()

runner.register_agent("my-agent", my_agent_factory)
```

When a request comes in targeting `"my-agent"`, the platform calls `my_agent_factory(agent_id)` and uses the returned `Agent` to execute the run.

---

## Calling Your Agent (HTTP)

```bash
# Synchronous call — blocks until done
curl -X POST http://localhost:8000/call/sync \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "messages": [{"role": "user", "content": "What is 2 + 2?"}],
    "org_id": "my-org",
    "thread_id": "my-project",
    "session_id": "session-001"
  }'
```

Response:

```json
{
  "thread_id": "my-project",
  "session_id": "session-001",
  "status": "done",
  "result": "2 + 2 = 4",
  "error": null,
  "run_count": 1
}
```

---

## Next Steps

- [Defining Tools →](02-tools.md)
- [Configuring LLMs (AgentProfile) →](03-agent-profile.md)
- [Controlling Execution (ExecutionStep) →](04-execution-steps.md)
