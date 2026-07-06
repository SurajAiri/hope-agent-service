# Agent Platform Architecture — Final Reference

---

Note: ContextManager is renamed to AgentContext.

## 1. Layer Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NODE.JS (Main Backend)                     │
│  user-facing: auth, rate limiting, routing                          │
│  decides: stream=True/False based on request type                   │
│  calls Runner (internal FastAPI worker)                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP (stream flag passed here)
┌────────────────────────────▼────────────────────────────────────────┐
│          DEPLOYED RUNNER INSTANCE (FastAPI / worker / etc.)         │
│                                                                     │
│  Streamer: lives here, smart lifecycle                         │
│  (does NOT hold connection blindly, opens/closes per .stream call)  │
│  Credentials for redis, db, s3 configured at this level             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   RUNNER FRAMEWORK                          │    │
│  │                                                             │    │
│  │  Receives Streamer from deployed instance                   │    │
│  │  Responsibilities: I/O, infrastructure creation, injection  │    │
│  │                                                             │    │
│  │  1. creates: redis, db, s3                                  │    │
│  │  2. creates: Engine(redis, db, s3)       singleton     │    │
│  │                                                             │    │
│  │  on Agent Run Trigger Setup:                           │    │
│  │    injects to ALL AgentCaller instances:                    │    │
│  │      foo._usage_tracker = engine.usage_tracker              │    │
│  │      foo._streamer      = streamer                          │    │
│  │    (AgentRunner, ToolCaller, and all future callers)        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ triggers with (idem_key, stream, agent_id,
                             │               messages, webhook, ...)
┌────────────────────────────▼────────────────────────────────────────┐
│                        ENGINE  [singleton]                          │
│                                                                     │
│  Receives injected: redis, db, s3                                   │
│  Creates internally:                                           │
│    BillManager(redis)      ← NEVER leaves Engine                   │
│    UsageTracker(bill_mgr)  ← exposed as engine.usage_tracker       │
│                                                                     │
│  Components:                                                        │
│    ExecutionManager  (status: redis, flow: checkpoint/restore)      │
│    BillManager       (budget tracking, internal only)               │
│    UsageTracker      (logging only, exposed as engine.usage_tracker)│
│    ErrorHandler      (alerts platform + developer on major errors)  │
│                                                                     │
│  Does NOT create any infrastructure.                                │
│  Does NOT expose BillManager outside itself.                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │ calls
┌────────────────────────────▼────────────────────────────────────────┐
│                      AGENT SDK                                      │
│  Actual agent logic. Infra-agnostic.                                │
│  Knows only: UsageTracker interface, Streamer interface             │
│                                                                     │
│  ResumeCheck   [ template method, see section 4]               │
│  ExecutionStep                                                      │
│  AgentRunner       (AgentCaller)                                    │
│  ContextManager    (aggregator, NOT AgentCaller)              │
│    └── ToolCaller  (AgentCaller)  [V1 only]                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Flow Hierarchy

```
### Architecture Hierarchy
- **Org**     → billing, team, members
- **Agent**   → what you deploy (config, tools, system prompt)
- **Thread**  → conversation continuity, message history
- **Session** → one job lifecycle, status tracking, idem_key
- **Run**     → one loop iteration (`ExecutionStep.run()`)
- **Step**    → one `AgentCaller.invoke()` — per-LLM-call billing, debugging

Engine  → responsible for running Agent and each run
Runner  → responsible for grabbing agent and triggering session
```

---

## 3. Execution Flow (Engine)

```
TRIGGER (idem_key, stream, agent_id, messages, webhook, ...)
    │
    ▼
RESUME CHECK  [ template method pattern, see section 4]
    │
    ├─ status == hitl:
    │     self.hitl_action() → bool
    │       load HITL actions
    │       all completed  → True  (continue to before_run)
    │       any pending    → False (skip below, WIP never set → loop won't run)
    │
    ├─ status == queue or created:
    │     self.initial_work()
    │       context of prev session under same project [v2]
    │
    ├─ status != queue or created (and not done):
    │     self.resume_work()
    │       checkpoint restore
    │
    └─ status not done:
          self.before_run(state)   [ unconditional hook before loop, see section 4]
          Engine sets status (WIP) ← Engine does this after before_run returns
         │
         ▼
    EXECUTION LOOP  (only runs if status == WIP)
         │
         ├─ [1] bill check → stop if exceed
         │
         ├─ [2] check status == interrupt or hitl → break
         │
         ├─ [3] ExecutionStep.run()   ← Agent SDK takes over here
         │         agent_runner.invoke(config, messages, stream=flag)
         │         context_manager.tool_caller.invoke(...)
         │         (agent sdk code space injected here similarly)
         │              │
         │              ▼
         │         AgentCaller.invoke()  [ single invoke, see section 5]
         │           internally: streams via streamer, accumulates usage,
         │           logs to usage_tracker, returns final response
         │           (AgentCaller's concern — not the loop's, not Agent SDK's)
         │
         ├─ [4] Periodic Checkpoint Dump (every N iterations → redis)
         │
         └─ break on: completion / error / interruption / HITL
              │
              ▼
         POST EXECUTION
              ├─ if error:
              │     Engine triggers alert via ErrorHandler
              └─ else:
                    set status (done / fail)
              │
              ▼
         DUMP DATA
              ├─ Dump remaining → Redis → Dump Queue → S3 (only remaining)
              └─ Metadata on DB
              │
              ▼
         WEBHOOK  (if webhook == true)
              ├─ ExecutionManager.fetch_org_webhook_entries()
              │     fetch from DB, entries associated with org_id
              │     (webhook urls originally mentioned in trigger)
              ├─ for each webhook entry:
              │     send webhook (session_id, status)
              └─ Retry: separate queue-based sender [v2]
```

---

## 4. ResumeCheck — Template Method Pattern

Engine provides default behavior. Agent SDK can override specific steps, not the whole algorithm.

```python
# ResumeCheck — only overridable hooks, no control flow
class ResumeCheck:
    def hitl_action(self, state) -> bool:
        # load HITL actions
        # all completed → True
        # any pending   → False
        ...

    def initial_work(self, state):
        # context of prev session under same project (message history) [v2]
        ...

    def resume_work(self, state):
        # checkpoint restore
        ...

    def before_run(self, state):
        # unconditional hook before loop, whether first run or resume
        # agent-specific pre-loop setup goes here
        ...

# Agent SDK overrides only what's different
class MyAgentResumeCheck(ResumeCheck):
    def resume_work(self, state):
        # custom restore logic for this agent
        ...

    def before_run(self, state):
        super().before_run(state)
        # agent-specific pre-loop setup
        ...
```

**Engine controls the actual flow** — ResumeCheck instance is injected into Engine. Engine calls the hooks, Engine decides what to do with the return values:

```python
# Inside Engine — this logic is NOT in ResumeCheck
def _run_resume_check(self, state, resume_check: ResumeCheck):
    if state.status == 'hitl':
        if not resume_check.hitl_action(state):
            return   # False → skip, WIP never set, loop won't run
    elif state.status in ('queue', 'created'):
        resume_check.initial_work(state)
    else:
        resume_check.resume_work(state)

    if state.status != 'done':
        resume_check.before_run(state)
        self._set_status(state, 'wip')   # Engine sets WIP, not the hook
```

**Why `before_run`:**

- `initial_work` and `resume_work` are conditional (one or the other)
- `before_run` is unconditional — fires regardless of first run or resume
- Engine sets WIP **after** `before_run` returns
- Agent gets a single hook for "I'm about to run" without duplicating in both paths

---

## 5. AgentCaller — Single invoke

Key change: single public `invoke`. Children implement `_do_invoke` and optionally `_do_stream`.
Engine/AgentSDK calls `invoke(stream=flag)` and gets clean final response either way.

```python
class AgentCaller(ABC):
    _usage_tracker: UsageTracker | None = None  # injected by runner
    _streamer: Streamer | None = None           # injected by runner

    def invoke(self, config, ..., stream=False):
        if stream:
            return self._handle_stream(config, ...)
        return self._handle_invoke(config, ...)

    def _handle_invoke(self, config, ...):
        try:
            response = self._do_invoke(config, ...)
            cost = self._calc_cost(config, response.usage)
            self._usage_tracker.log(config, response.usage, cost, status='success')
            return response
        except Exception as e:
            self._usage_tracker.log(config, usage=None, cost=None, status='error')
            # UsageTracker only logs. Alerting is Engine's responsibility.
            raise  # Engine catches this, triggers alert via its error handler component

    def _handle_stream(self, config, ...):
        accumulated_usage = None
        final_chunk = None
        try:
            for chunk in self._do_stream(config, ...):
                self._streamer.push(chunk)           # streamer handles connection lifecycle
                if chunk.usage_delta:
                    accumulated_usage = merge_usage(accumulated_usage, chunk.usage_delta)
                final_chunk = chunk
            cost = self._calc_cost(config, accumulated_usage)
            self._usage_tracker.log(config, accumulated_usage, cost, status='success')
            return final_chunk
        except Exception as e:
            # log what was accumulated before crash, no charge
            self._usage_tracker.log(config, accumulated_usage, cost=None, status='error')
            # UsageTracker only logs. Engine catches the re-raised exception
            # and triggers alert (platform + developer) via its error handler.
            raise

    # Default _do_stream: tool callers only need _do_invoke
    # LLM callers override both
    def _do_stream(self, config, ...):
        yield self._do_invoke(config, ...)

    @abstractmethod
    def _do_invoke(self, config, ...): pass
```

**On failure:**

- Usage is logged (what was consumed before crash), no charge (cost=None)
- Exception re-raised to Engine
- Engine's error handler component triggers alert: platform side + developer side
- Engine breaks the execution loop cleanly

---

## 6. ContextManager — Aggregator

ContextManager is NOT an AgentCaller. It holds references to caller children.
Tools are associated with ToolCaller, not ContextManager directly.

```python
class ToolCaller(AgentCaller):
    def __init__(self, tools):
        self._tools = {t.name: t for t in tools}  # tools live here, not on CM

    def _do_invoke(self, config, ...):
        tool = self._tools[config['tool_name']]
        return tool.run(config['input'])

class ContextManager:
    tool_caller: ToolCaller   # received from constructor

    # v2:
    # connector_caller: ConnectorCaller
    # rag_connector: RAGConnector
    # memory_manager: MemoryManager
```

Layered tool resolution — agent's own ToolCaller takes priority over runner-level:

```
Agent's ContextManager.tool_caller  (agent-specific tools, checked first)
    ↓ not found
Runner's ContextManager.tool_caller (shared runner-level tools)
    ↓ not found
None / raise
```

Runner creates root ContextManager with shared tools.
Agent creates its own ContextManager with agent-specific tools, parent=runner_cm.
ToolCaller on each level owns its own tool registry. No shared mutation.

---

## 7. Streaming Decision Chain

Streaming is an I/O concern, not an agent logic concern. Agent SDK does not decide it.

```
User
  → Node.js (decides stream=True/False from request type)
    → Runner (passes stream flag in trigger)
      → Engine (passes to ExecutionStep)
        → Agent SDK (invoke called with stream=flag, does not decide)
```

---

## 8. BillManager [clarified, no change to behavior]

- Created by Engine internally
- Never exposed outside Engine
- Uses Redis for sync_records
- Local budget state + Redis sync = eventual consistency (not strictly race-safe, accepted overshoot)
- Engine calls BillManager for bill_check at top of each execution loop iteration
- UsageTracker is the only billing-adjacent object that leaves Engine (as engine.usage_tracker)

---

## 9. UsageRecord Schema (on DB)

```
identity:  org_id, thread_id, session_id, session_id, step_id, user_id?, extras
resource:  resource_type, resource_id/name, idem_key, cost_fn_version?
usage:     prompt_tokens, completion_tokens, request_count
others:    usage_raw (jsonb), credit_cost, timestamp, status  ← status='error'|'success'
```

`status='error'` in UsageRecord is a log flag only. Alerting is triggered by Engine's error handler, not by UsageTracker reading this field.

---

## 10. V1 Scope (What is actually built now)

```
✅ Engine (ExecutionManager, BillManager, UsageTracker)
✅ Runner (FastAPI, infra creation, injection)
✅ AgentRunner (AgentCaller)
✅ ToolCaller (AgentCaller)  ← only caller in ContextManager for V1
✅ Streamer (smart lifecycle)
✅ ResumeCheck (default + override)
✅ ExecutionStep
✅ AgentConfig, AgentRunner interface
✅ Checkpoint/restore
✅ Webhook on completion

❌ ConnectorCaller   → V2
❌ RAGConnector      → V2
❌ MemoryManager     → V2
❌ Skills            → V2
❌ Artifacts         → V2
```

---

## 11. Key Design Rules (non-negotiable)

1. Engine is a singleton. Never recreated per request.
2. BillManager never leaves Engine. Not injected, not exposed.
3. Engine does not create infrastructure. redis/db/s3 come from Runner.
4. AgentCaller children never implement public `invoke`. Only `_do_invoke` and optionally `_do_stream`.
5. Streaming decision flows from user → down. Agent SDK never decides it.
6. ContextManager is an aggregator, never an AgentCaller. Tools belong to ToolCaller, not CM.
7. Connector and ToolCaller are responsible for idempotency and deduplication of their own calls.
8. On any AgentCaller failure: log usage, no charge, re-raise. Engine's ErrorHandler triggers alert.
