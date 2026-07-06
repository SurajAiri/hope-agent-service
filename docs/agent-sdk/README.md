# AgentSDK Documentation

The **AgentSDK** is the developer-facing package you use to build agents on the Agent-as-a-Service platform. It is infrastructure-agnostic — your agent code has zero awareness of Redis, Postgres, or S3. All that is managed by the platform.

## Contents

| Document | Description |
|----------|-------------|
| [01 — Getting Started](01-getting-started.md) | Installation, minimal working agent, and registration |
| [02 — Defining Tools](02-tools.md) | `@tool` decorator and `BaseTool` class-based approach |
| [03 — Agent Configuration](03-agent-profile.md) | `AgentProfile`, `LlmConfig`, and LLM preset slots |
| [04 — Execution Steps](04-execution-steps.md) | `DefaultExecutionStep`, `ReActExecutionStep`, and custom steps |
| [05 — Registering Agents](05-registering-agents.md) | Factory functions and `runner.register_agent()` |
| [06 — Resume & Lifecycle Hooks](06-resume-check.md) | `ResumeCheck` hooks for HITL and checkpoint-resume |
| [07 — Testing](07-testing.md) | `MockAgentRunner`, `MockToolCaller`, and test helpers |
| [08 — API Reference](08-api-reference.md) | Complete reference for all SDK classes and types |
| [09 — LangGraph Support](09-langgraph.md) | Wrapping a LangGraph `StateGraph` as an Agent, including HITL via `interrupt()` |

---

## Architecture Hierarchy & Terminology

The platform enforces a strict execution hierarchy to cleanly separate identity, tracking, and iteration bounds.

- **Org**: Billing, team, members
- **Agent**: What you deploy (config, tools, system prompt)
- **Thread**: Conversation continuity, message history
- **Session**: One job lifecycle, status tracking, idem_key
- **Run**: One loop iteration (`ExecutionStep.run()`)
- **Step**: One `AgentCaller.invoke()` — per-LLM-call billing, debugging

---

## Key Concepts at a Glance

```
AgentProfile          — your agent's identity + LLM configuration
  └─ LlmConfig        — one model + provider configuration

Agent                 — container for all agent components
  ├─ AgentRunner      — calls the LLM (LitellmAgentRunner built-in)
  ├─ AgentContext     — holds your tools
  │    └─ ToolCaller  — dispatches tool calls, handles timeout + safety
  ├─ ExecutionStep    — your logic: how the agent thinks each run
  └─ ResumeCheck      — lifecycle hooks (optional)

@tool / BaseTool      — define tools the LLM can call
create_agent()        — convenience factory to build Agent with good defaults
create_simple_agent() — minimal factory for quick prototypes
```
