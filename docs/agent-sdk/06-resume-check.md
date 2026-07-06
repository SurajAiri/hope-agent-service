# 06 — Resume & Lifecycle Hooks

The platform manages the full run lifecycle. As a developer, you can hook into key lifecycle events using `ResumeCheck` — without taking over the control flow.

---

## How the Lifecycle Works

Every run has a status that progresses through states:

```
created → queue → wip → done
                      ↘ fail
                   ↗ hitl (paused for human input)
                   ↗ interrupt (paused, resumable by re-trigger)
```

Before the execution loop runs, the Engine performs a **resume check** to determine if this is a first run, a resume, or a HITL situation. Your `ResumeCheck` hooks are called at each stage.

---

## `ResumeCheck`

`ResumeCheck` is a collection of optional hooks. Subclass it and override only the hooks you need. All default implementations are no-ops.

```python
from agent_sdk import ResumeCheck, RunState

class MyResumeCheck(ResumeCheck):

    def before_run(self, state: RunState) -> None:
        """Called before every run — first run AND resume. Engine sets status=WIP after this."""
        print(f"Starting run {state.session_id} for agent {state.agent_id}")

    def initial_work(self, state: RunState) -> None:
        """Called only on the very first run (status was queue or created)."""
        # E.g. load prior session context, initialize state
        pass

    def resume_work(self, state: RunState) -> None:
        """Called when resuming from a checkpoint (status was interrupt)."""
        # E.g. restore custom state from state.checkpoint_data
        my_state = state.checkpoint_data.get("my_key")

    def hitl_action(self, state: RunState) -> bool:
        """Called when status is 'hitl'. Return True to continue, False to keep waiting."""
        hitl_tasks = state.checkpoint_data.get("hitl_actions", [])
        return all(task["completed"] for task in hitl_tasks)
```

Pass your `ResumeCheck` to `create_agent()`:

```python
def my_factory(agent_id: str) -> Agent:
    return create_agent(
        agent_id,
        agent_profile=PROFILE,
        tools=[...],
        resume_check=MyResumeCheck(),
    )
```

---

## Hook Reference

| Method | When called | Return value |
|--------|-------------|--------------|
| `before_run(state)` | Before every execution loop — both first runs and resumes | None |
| `initial_work(state)` | Status was `queue` or `created` (first-time run) | None |
| `resume_work(state)` | Status was `interrupt` (resuming from checkpoint) | None |
| `hitl_action(state)` | Status was `hitl` (waiting for human input) | `bool`: `True` = proceed, `False` = keep waiting |

**Important:** The Engine controls the flow. Hooks run in the Engine, which decides what to do with return values. Your hooks should **not** modify `state.status` directly.

---

## `RunState` — what your hooks receive

`RunState` is a typed, read-only protocol exposing the fields your hooks are allowed to read:

| Field | Type | Description |
|-------|------|-------------|
| `thread_id` | `str` | Conversation continuity / message history |
| `session_id` | `str` | Job Lifecycle ID |
| `agent_id` | `str` | Registered agent ID |
| `status` | `str` | Current run status string |
| `messages` | `list[Any]` | Accumulated conversation messages |
| `run_id` | `int` | Current loop run count |
| `max_runs` | `int` | Configured maximum iterations |
| `checkpoint_data` | `dict[str, Any]` | Arbitrary checkpoint state |

Annotate your hook parameters with `RunState` for IDE autocomplete:

```python
from agent_sdk import ResumeCheck, RunState

class MyResumeCheck(ResumeCheck):
    def before_run(self, state: RunState) -> None:
        # Full IDE autocomplete for state.session_id, state.agent_id, etc.
        ...
```

---

## HITL (Human-in-the-Loop)

HITL runs are paused at the platform level. Your `ExecutionStep.run()` signals HITL by returning:

```python
return StepResult(
    status=StepStatus.HITL,
    messages=messages,
    hitl_actions=[{"id": "approve-1", "value": {"question": "Approve this?"}}],
)
```

The Engine sets `RunStatus.HITL` and persists `hitl_actions` for you — this is the only writer for the HITL side-channel, so you don't need (and shouldn't try) to set status externally.

When your application layer has a human answer, attach it to the matching action and call:

```python
await engine.submit_hitl_response(session_id, actions)  # actions = full list, with `response` filled in
```

Then re-trigger the same `session_id`. On re-trigger:
1. The Engine loads the current `hitl_actions` (with any responses) and calls `hitl_action(state)` on your `ResumeCheck`
2. If it returns `True` → checkpoint is restored and the execution loop resumes (your `resume_work(state)` hook fires first — pull the answer out of `state.checkpoint_data["hitl_actions"]` here)
3. If it returns `False` → the run stays paused (loop does not run)

```python
class MyResumeCheck(ResumeCheck):
    def hitl_action(self, state: RunState) -> bool:
        actions = state.checkpoint_data.get("hitl_actions", [])
        return all(a.get("response") is not None for a in actions)

    def resume_work(self, state: RunState) -> None:
        actions = state.checkpoint_data.get("hitl_actions", [])
        answer = next((a["response"] for a in actions if a.get("response") is not None), None)
        state.checkpoint_data["my_resume_value"] = answer
```

If you're wrapping a LangGraph graph, `agent_sdk.langgraph` already implements this pattern for you around LangGraph's own `interrupt()`/`Command(resume=...)` — see [09-langgraph.md](./09-langgraph.md).

---

## Checkpoint Data

`checkpoint_data` is a `dict[str, Any]` that persists across loop iterations and run resumes. Your `ExecutionStep` can write to it via `StepResult.state_data`:

```python
return StepResult(
    status=StepStatus.CONTINUE,
    messages=messages,
    state_data={"my_key": "my_value"},  # merged into checkpoint_data
)
```

Your `ResumeCheck` hooks can read it:

```python
def resume_work(self, state: RunState) -> None:
    my_value = state.checkpoint_data.get("my_key")
```

The platform checkpoints to Redis on every run and archives to S3 periodically.
