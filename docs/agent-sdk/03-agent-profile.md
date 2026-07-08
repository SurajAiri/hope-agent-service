# 03 — Agent Configuration

All agent configuration lives in `AgentProfile`. It defines:

- Which LLM(s) to use and how
- The agent's run cap
- The system prompt (auto-injected if set)

---

## `AgentProfile`

`AgentProfile` is the central configuration object for your agent. You create one and pass it to `Agent.create()`.

```python
from agent_sdk import AgentProfile, LlmConfig

PROFILE = AgentProfile(
    agent_id="my-agent",
    max_runs=20,
    system_prompt="You are a helpful assistant.",
    default_llm=LlmConfig(model="gpt-4o", provider="openai"),
    fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
    fallback_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
)
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agent_id` | `str` | required | Unique agent identifier — must match registration key |
| `max_runs` | `int` | `50` | Max execution loop runs per session |
| `system_prompt` | `str \| None` | `None` | Auto-injected as a system message if not already in messages |
| `default_llm` | `LlmConfig \| None` | `None` | General-purpose default LLM |
| `fallback_llm` | `LlmConfig \| None` | `None` | Used when no other config matches a slug |
| `fast_llm` | `LlmConfig \| None` | `None` | Low-latency / cheap model for simple subtasks |
| `strong_llm` | `LlmConfig \| None` | `None` | Most capable model for complex reasoning |
| `presets` | `dict[str, LlmConfig]` | `{}` | Custom named LLM configurations |

> **At least one LLM must be configured** (any slot or `presets`), or `LitellmAgentRunner` will raise `AgentConfigurationError` at first invocation.

---

## `LlmConfig`

`LlmConfig` configures a single LLM call — model, provider, sampling parameters, and optional cost overrides.

```python
from agent_sdk import LlmConfig

config = LlmConfig(
    model="gpt-4o",
    provider="openai",
    temperature=0.7,    # optional, default 0.7
    max_tokens=4096,    # optional, default 4096
)
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `str` | required | LiteLLM model string (e.g. `"gpt-4o"`, `"claude-3-5-sonnet-20241022"`, `"gemini/gemini-2.0-flash"`) |
| `provider` | `str` | required | Provider name (e.g. `"openai"`, `"anthropic"`, `"gemini"`, `"fireworks_ai"`) |
| `temperature` | `float` | `0.7` | Sampling temperature |
| `max_tokens` | `int` | `4096` | Maximum completion tokens |
| `extras` | `dict` | `{}` | Provider-specific kwargs forwarded to LiteLLM |
| `input_cost_per_token` | `float \| None` | `None` | Manual cost override for prompt tokens |
| `output_cost_per_token` | `float \| None` | `None` | Manual cost override for completion tokens |

### Supported providers

The SDK uses **LiteLLM** under the hood, giving you access to 100+ providers. Examples:

```python
# OpenAI
LlmConfig(model="gpt-4o", provider="openai")
LlmConfig(model="gpt-4o-mini", provider="openai")

# Anthropic
LlmConfig(model="claude-3-5-sonnet-20241022", provider="anthropic")

# Google Gemini
LlmConfig(model="gemini/gemini-2.0-flash", provider="gemini")

# Fireworks AI
LlmConfig(model="fireworks_ai/accounts/fireworks/models/deepseek-v3", provider="fireworks_ai")

# Any OpenAI-compatible endpoint
LlmConfig(
    model="my-model",
    provider="openai",
    extras={"api_base": "https://my-endpoint.example.com/v1"},
)
```

---

## LLM Preset Slots

`AgentProfile` provides four **named typed slots** for the most common LLM roles:

| Slot | Slug | Typical use |
|------|------|-------------|
| `default_llm` | `"default"` | Primary model for general reasoning |
| `fallback_llm` | `"fallback"` | Safety net when no slug matches |
| `fast_llm` | `"fast"` | Cheap/fast model for simple tasks |
| `strong_llm` | `"strong"` | Most capable model for hard problems |

You can use any combination. Slots you don't set are simply not available (unless `fallback_llm` covers them).

### Resolving a preset inside an `ExecutionStep`

```python
# Inside your custom ExecutionStep.run():
config = agent_runner.agent_profile.get_config("fast")
response = await agent_runner.invoke(config=config, messages=context.messages)
```

Slug resolution order:
1. Named preset (slot or `presets` dict)
2. `fallback_llm` (if set)
3. `ValueError` (with a helpful message)

---

## Custom Presets

Beyond the four typed slots, you can add arbitrary named LLM configurations:

```python
PROFILE = AgentProfile(
    agent_id="multi-model-agent",
    default_llm=LlmConfig(model="gpt-4o", provider="openai"),
    presets={
        "vision": LlmConfig(model="gpt-4o", provider="openai"),
        "summarizer": LlmConfig(model="gpt-4o-mini", provider="openai"),
        "coder": LlmConfig(model="claude-3-5-sonnet-20241022", provider="anthropic"),
    },
)
```

Access them the same way: `profile.get_config("vision")`.

---

## Cost Tracking

Set per-token cost overrides on `LlmConfig` if you use a private model not in LiteLLM's pricing database:

```python
LlmConfig(
    model="my-private-model",
    provider="openai",
    input_cost_per_token=0.000001,   # $0.001 per 1000 prompt tokens
    output_cost_per_token=0.000003,  # $0.003 per 1000 completion tokens
)
```

When set, these override LiteLLM's auto-pricing for that model.

---

## `system_prompt` Auto-injection

If you set `system_prompt` on `AgentProfile`, the built-in execution steps (`DefaultExecutionStep` and `ReActExecutionStep`) will **automatically inject it** as the first message if no system message is already present.

```python
PROFILE = AgentProfile(
    agent_id="my-agent",
    system_prompt="You are a concise assistant. Answer in 2 sentences max.",
    default_llm=LlmConfig(model="gpt-4o", provider="openai"),
)
```

This saves you from manually prepending a `SystemMessage` in your step logic.

---

## `max_runs`

Each session has an run cap. `max_runs` on `AgentProfile` is the agent-level default. It can be overridden per-request via `TriggerParams.max_runs`.

The platform enforces an absolute hard cap of 200 runs regardless of configuration.

```python
AgentProfile(
    agent_id="long-running-agent",
    max_runs=100,  # agent default — up to 100 runs per session
    ...
)
```
