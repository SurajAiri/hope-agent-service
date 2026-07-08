# 09 — LangGraph Support

`agent_sdk.langgraph` lets you write a plain [LangGraph](https://langchain-ai.github.io/langgraph/) `StateGraph` — including `interrupt()` calls for human-in-the-loop — and register it as an Agent through the platform with the same lifecycle guarantees as any pure-python agent: checkpointing, resume, HITL, all handled by the Engine.

Install: `pip install 'hope-agent-sdk[langgraph]'`

---

## Quick start

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from agent_sdk.langgraph import LangGraphAgent

def call_model(state: MessagesState) -> dict:
    # your own LLM call here — langchain chat model, litellm, whatever
    ...
    return {"messages": [ai_message]}

def build_graph() -> StateGraph:
    g = StateGraph(MessagesState)
    g.add_node("call_model", call_model)
    g.add_edge(START, "call_model")
    g.add_edge("call_model", END)
    return g

def my_factory(agent_id: str) -> LangGraphAgent:
    return LangGraphAgent.create(agent_id, graph_builder=build_graph)

runner.register_agent("my-langgraph-agent", my_factory)
```

`graph_builder` must return an **uncompiled** `StateGraph` — don't call `.compile()` yourself. The wrapper compiles it internally with its own checkpointer on every run (see "How checkpointing works" below).

---

## How it fits the architecture

Same four components as any agent, just LangGraph-flavored versions of each:

| Component | Pure-python | LangGraph |
|---|---|---|
| Runner (the "caller") | `LitellmAgentRunner` | `LangGraphAgentRunner` |
| Execution step | `ReActExecutionStep` | `LangGraphExecutionStep` |
| Resume hooks | your `ResumeCheck` | `LangGraphResumeCheck` |
| Factory | `Agent.create()` | `LangGraphAgent.create()` |

`LangGraphAgent.create()` wires all three together. Nothing in the Engine changed to support this beyond two small, generic fixes described below — the actual LangGraph-specific logic lives entirely in `agent_sdk.langgraph`.

> The old module-level `create_langgraph_agent()` function still exists as a
> deprecated back-compat shim that just calls `LangGraphAgent.create()` —
> new code should call the classmethod directly.

One call to `LangGraphExecutionStep.run()` drives one full LangGraph run — from the initial input (or a resume) through to completion or the next interrupt. There's no `CONTINUE` case: LangGraph's own Pregel loop already runs its internal supersteps in one `ainvoke`/`astream` call.

---

## How checkpointing works (and why it doesn't need new infra)

LangGraph needs its own checkpointer to support `interrupt()`/resume. Standing up a second persistence layer (Postgres/Redis checkpointer) for it would violate the SDK's "infra-agnostic" rule and duplicate what the Engine already does.

Instead: `LangGraphAgentRunner` uses LangGraph's in-memory `InMemorySaver`, and at the end of every run, serializes its storage into a single opaque base64 string that rides inside `StepResult.state_data` — i.e. the *existing* checkpoint_data mechanism the Engine already persists Redis → S3. On the next run, the blob is decoded and used to rebuild a fresh `InMemorySaver` before the graph runs again.

This works because:
- Agent instances (and the compiled graph) are rebuilt fresh on every `trigger_session()` call anyway (see the Runner docs — components should be stateless), so an in-memory checkpointer tied to one instance was never going to survive across calls regardless.
- One session == one LangGraph "thread" — since the checkpointer is always rebuilt fresh from your own state_data and never shared across sessions, a fixed internal thread_id is safe.

**Limitation:** whatever your graph puts in its state must be picklable (LangChain messages, dicts, dataclasses, pydantic models — all fine; open file handles, locks — not fine).

---

## HITL — how `interrupt()` maps onto the platform

Call LangGraph's `interrupt()` in any node exactly as you normally would:

```python
from langgraph.types import interrupt

def approval_gate(state: MessagesState) -> dict:
    decision = interrupt({"question": "Approve this reply?", "draft": state["messages"][-1].content})
    ...
```

What happens under the hood:

1. The graph pauses. `LangGraphAgentRunner` detects this via `graph.aget_state()` and returns it in `AgentResponse.metadata`.
2. `LangGraphExecutionStep` turns that into `StepResult(status=StepStatus.HITL, hitl_actions=[{"id": ..., "value": {...}}])`.
3. The Engine sets `RunStatus.HITL` and persists `hitl_actions` — this is the same generic mechanism any HITL agent uses (see [06-resume-check.md](./06-resume-check.md)), nothing LangGraph-specific in the Engine.
4. Your application layer reads the pending action, gets a human answer, and calls:
   ```python
   await engine.submit_hitl_response(session_id, actions)  # actions[i]["response"] = "yes"
   ```
5. Re-trigger the same `session_id`. `LangGraphResumeCheck.hitl_action()` sees every action now has a `response` and returns `True`; `resume_work()` pulls the response into `state_data`; `LangGraphAgentRunner` rebuilds the checkpointer from the stored blob and calls `graph.ainvoke(Command(resume=<response>), config)` — the graph continues exactly where it left off.

**V1 scope:** this assumes one interrupt is pending at a time (the common sequential-approval case). If your graph raises multiple parallel interrupts in the same superstep, subclass `LangGraphResumeCheck` and override `hitl_action()`/`resume_work()` to build the `{interrupt_id: value}` mapping `Command(resume=...)` needs for that case.

The `fastapi-demo` app includes two working examples: `agents/langgraph_agent.py` (basic `MessagesState` chat agent) and `agents/langgraph_hitl_approval_agent.py` (custom `{query, decision, response}` state with a real approve/reject HITL branch), plus two demo endpoints (`GET`/`POST /session/{session_id}/hitl`) showing how an application layer reads and answers pending actions.

---

## Message adapters (custom state schemas)

By default the wrapper assumes the common `MessagesState` convention — a `"messages"` key holding LangChain `BaseMessage` objects, combined via `add_messages`. It converts these to/from `agent_sdk.messages.AnyMessage` automatically so the platform's own conversation history (`state.messages`, checkpointed by the Engine) stays in sync with what the graph produced.

If your graph's state schema is different, override the adapters:

```python
LangGraphAgent.create(
    agent_id,
    graph_builder=build_graph,
    input_adapter=my_input_adapter,             # list[AnyMessage] -> dict
    output_adapter=my_output_adapter,           # dict -> Any (StepResult.output)
    new_messages_adapter=my_new_messages_adapter,  # (known_count, dict) -> list[AnyMessage]
)
```

See `agent_sdk/langgraph/messages.py` for the default implementations to use as a reference, and `apps/fastapi-demo/src/fastapi_demo/agents/langgraph_hitl_approval_agent.py` for a full worked example with a custom `{query, decision, response}` state (request → human approval → LLM call or rejection).

---

## What's *not* wired up (documented, not silent)

- **Usage tracking / billing**: LangGraph makes its own LLM calls internally (via whatever chat model you use inside your nodes) — those calls are invisible to the platform's `UsageTracker`. Runs still get logged (via `AgentCaller`'s existing plumbing) but with zero token counts / no cost. Bridging a LangChain callback handler into `UsageTracker.log()` is a reasonable follow-up but is a genuinely separate piece of work from getting checkpointing/HITL right, so it isn't attempted here.
- **True token streaming metadata caveat**: `LangGraphAgentRunner._do_stream` bridges `on_chat_model_stream` events for real token-by-token streaming when your graph's nodes call a streaming-capable chat model. If a node returns a canned message without going through a streamed model call, no token events fire and the platform falls back to using the graph's final state for output (this is handled correctly — `LangGraphExecutionStep` always reads the authoritative final value, never just the raw streamed text).
- **Static `interrupt_before`/`interrupt_after` graph compile options**: only the dynamic `interrupt()` function call pattern is supported for HITL detection in V1 (this is also LangGraph's own more modern/recommended approach).
