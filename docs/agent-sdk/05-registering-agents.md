# 05 — Registering Agents

Agents are registered with the platform via **factory functions**. The platform calls your factory every time a run is triggered for that agent ID.

---

## The Factory Function Pattern

A factory function has this signature:

```python
def my_agent_factory(agent_id: str) -> Agent:
    ...
```

The factory receives the `agent_id` it was registered under and returns an `Agent` object. It is called **fresh on every run** — keep your components lightweight (stateless is ideal).

---

## Registering with the Runner

Call `runner.register_agent()` at startup, after `await runner.setup()`:

```python
from runner.runner import Runner

runner = Runner()
await runner.setup()

runner.register_agent("my-agent", my_agent_factory)
```

Multiple agents can be registered:

```python
runner.register_agent("echo",   echo_agent_factory)
runner.register_agent("simple", simple_agent_factory)
runner.register_agent("react",  react_agent_factory)
```

The `agent_id` string in `register_agent()` must match:
1. The `agent_id` field in your `AgentProfile`
2. The `agent_id` field in the HTTP request body

---

## FastAPI lifespan integration

The typical pattern in FastAPI is to register agents inside the `lifespan` context manager:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from runner.runner import Runner

runner: Runner | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global runner

    runner = Runner()
    await runner.setup()

    # Register your agents here
    runner.register_agent("my-agent", my_agent_factory)
    runner.register_agent("another-agent", another_agent_factory)

    yield  # app is running

    await runner.teardown()

app = FastAPI(lifespan=lifespan)
```

---

## Shared (Platform-Level) Tools

Some tools should be available to **all agents** on the platform (e.g., audit logging, rate limiting). Register them with `runner.register_tools()` after `setup()`:

```python
await runner.setup()
runner.register_tools(AuditLogTool(), RateLimiterTool())

runner.register_agent("my-agent", my_agent_factory)
```

Shared tools are resolved via the parent-chain in `AgentContext`. Agent-specific tools always take priority over shared tools with the same name.

---

## Factory examples

### Simplest possible factory

```python
from agent_sdk import Agent, create_simple_agent

def echo_factory(agent_id: str) -> Agent:
    return create_simple_agent(
        agent_id,
        model="gpt-4o-mini",
        provider="openai",
        system_prompt="Repeat back exactly what the user says.",
    )

runner.register_agent("echo", echo_factory)
```

### Full-featured factory

```python
from agent_sdk import Agent, AgentProfile, LlmConfig, ReActExecutionStep, create_agent

PROFILE = AgentProfile(
    agent_id="research-agent",
    max_runs=30,
    system_prompt="You are a research assistant. Use search tools to answer questions accurately.",
    default_llm=LlmConfig(model="gpt-4o", provider="openai"),
    fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
    fallback_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
)

def research_agent_factory(agent_id: str) -> Agent:
    return create_agent(
        agent_id,
        agent_profile=PROFILE,
        tools=[WebSearchTool(), WikipediaTool(), CalcTool()],
        execution_step=ReActExecutionStep(max_tool_rounds=8),
        metadata={"version": "1.0", "team": "research"},
    )

runner.register_agent("research-agent", research_agent_factory)
```

### Factory with custom runner (no LLM)

```python
from agent_sdk import Agent, AgentProfile, AgentContext
from my_agents.custom_runner import MyCustomRunner
from my_agents.custom_step import MyCustomStep

def custom_factory(agent_id: str) -> Agent:
    profile = AgentProfile(agent_id=agent_id)
    return Agent(
        agent_id=agent_id,
        runner=MyCustomRunner(agent_profile=profile),
        agent_context=AgentContext(tools=[MyTool()]),
        execution_step=MyCustomStep(),
    )

runner.register_agent("custom", custom_factory)
```

---

## Introspection

```python
# List all registered agent IDs
runner.list_agents()
# → ["echo", "simple", "react"]

# Get a fully instantiated Agent (for inspection — no run triggered)
agent = runner.get_agent("echo")
print(agent.metadata)

# Wire an agent (inject deps, no run triggered) — useful for step-level tests
agent = runner.wire_agent("echo", stream=False)
```
