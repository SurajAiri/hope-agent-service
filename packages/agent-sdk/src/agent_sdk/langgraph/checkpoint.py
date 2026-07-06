"""
agent_sdk.langgraph.checkpoint
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Portable snapshot/restore for LangGraph's InMemorySaver.

Why not stand up a real LangGraph checkpointer backend (Postgres/Redis)?
  - That would push a second, independently-managed infra connection into
    agent-sdk, which is supposed to be infra-agnostic (see agent_sdk.types
    module docstring: "zero infrastructure knowledge").
  - Agent instances (and therefore the compiled graph) are rebuilt fresh on
    every trigger_session() call — see packages/runner: "Components in Agent
    should be lightweight (stateless is ideal)" — so an in-memory checkpointer
    tied to one graph instance can't outlive a single call anyway.
  - The Engine already solves exactly this problem generically: StepResult
    .state_data is merged into ExecutionState.checkpoint_data and persisted
    Redis -> S3 across calls (see engine.execution_manager). Instead of a
    second persistence layer, we serialize LangGraph's own checkpoint state
    into one opaque string and let it ride inside that existing mechanism.

How:
  - InMemorySaver keeps checkpoints as plain Python objects (no serde
    round-trip) across three dicts: .storage, .writes, .blobs.
  - InMemorySaver itself is NOT picklable as a whole (its `serde` attribute
    holds an unpicklable closure), so we pickle only the three plain-data
    dicts and rebuild a fresh InMemorySaver from them on restore.
  - Engine's checkpoint_data must be JSON-safe (ExecutionState.to_dict() is
    fed to json.dumps(..., default=str) — see engine.execution_manager
    ._save_checkpoint). Raw pickle bytes would get str()'d by `default=str`
    and be unrecoverable, so we base64-encode to a plain string first.
  - One session == one LangGraph "thread". Since the checkpointer is always
    rebuilt fresh from this blob (never shared across sessions/instances),
    a single fixed thread_id constant is enough — see LANGGRAPH_THREAD_ID.

Known limitation (by design, not accidental): this only works because
InMemorySaver keeps live Python objects rather than serializing channel
values itself. Anything the developer's graph puts into its state must be
picklable — true for LangChain messages, dicts, dataclasses, and pydantic
models, not true for things like open file handles or locks.
"""
from __future__ import annotations

import base64
import pickle
from typing import Any


LANGGRAPH_THREAD_ID = "agent-sdk-session"


def _require_langgraph_checkpoint() -> Any:
    try:
        from langgraph.checkpoint.memory import InMemorySaver

        return InMemorySaver
    except ImportError as exc:
        raise ImportError(
            "LangGraph is not installed. Install it with:\n"
            "  pip install langgraph\n"
            "Or add 'langgraph' to your agent's dependencies "
            "(pip install 'hope-agent-sdk[langgraph]')."
        ) from exc


def new_checkpointer() -> Any:
    """Create a fresh, empty InMemorySaver for a brand-new session."""
    in_memory_saver_cls = _require_langgraph_checkpoint()
    return in_memory_saver_cls()


def snapshot_checkpointer(saver: Any) -> str:
    """
    Serialize an InMemorySaver's plain-data storage into a base64 string
    suitable for StepResult.state_data — survives the platform's
    json.dumps(..., default=str) checkpoint round-trip intact.
    """
    payload = {
        "storage": dict(saver.storage),
        "writes": dict(saver.writes),
        "blobs": dict(saver.blobs),
    }
    return base64.b64encode(pickle.dumps(payload)).decode("ascii")


def restore_checkpointer(blob: str) -> Any:
    """Rebuild an InMemorySaver from a blob produced by snapshot_checkpointer()."""
    in_memory_saver_cls = _require_langgraph_checkpoint()
    saver = in_memory_saver_cls()
    payload = pickle.loads(base64.b64decode(blob))
    for key, value in payload["storage"].items():
        saver.storage[key] = value
    for key, value in payload["writes"].items():
        saver.writes[key] = value
    for key, value in payload["blobs"].items():
        saver.blobs[key] = value
    return saver


def build_config(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build the LangGraph run config for this wrapper's thread_id convention."""
    configurable = {"thread_id": LANGGRAPH_THREAD_ID}
    if extra:
        configurable.update(extra)
    return {"configurable": configurable}
