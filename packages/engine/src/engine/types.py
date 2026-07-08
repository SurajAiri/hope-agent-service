"""
engine.types
~~~~~~~~~~~~
Engine-specific types: execution state, run status, trigger params, usage record schema.
These types flow through the Engine but do NOT leak into Agent SDK.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from agent_sdk.messages import AnyMessage, parse_message
from pydantic import BaseModel, Field

# Absolute hard cap on execution loop iterations, regardless of agent config
# or per-request override. Single source of truth — engine.py's execution
# loop clamps to this, and TriggerParams.max_runs validates against it below,
# so an out-of-range value fails fast at the API boundary (422) instead of
# being silently clamped deep inside the loop.
MAX_RUNS_HARD_CAP = 200


# ---------------------------------------------------------------------------
# WebhookConfig — structured config for a webhook endpoint
# ---------------------------------------------------------------------------


class WebhookSignatureConfig(BaseModel):
    """
    HMAC signature config for outgoing webhook requests.

    The Engine will compute HMAC-{algorithm}(secret, body) and attach it as
    the value of ``header_name`` in the request headers.
    """

    header_name: str                     # e.g. "X-Signature"
    secret: str
    algorithm: Literal["sha256"] = "sha256"


class WebhookConfig(BaseModel):
    """
    Full configuration for a webhook endpoint.

    Fields
    ------
    url         : Target HTTP(S) URL — only POST is supported.
    headers     : Extra request headers (e.g. authorization tokens).
    signature   : Optional HMAC signing config.
    max_retries : 0 = no retry (current default), -1 = infinite (future).
    """

    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    signature: WebhookSignatureConfig | None = None
    max_retries: int = 0           # V1: always 0 — retry queue is V2

# ---------------------------------------------------------------------------
# Run lifecycle status
# ---------------------------------------------------------------------------


class RunStatus(str, Enum):
    CREATED = "created"        # Run record created, not yet queued
    QUEUE = "queue"            # Queued, waiting for worker to pick up
    WIP = "wip"                # Actively executing
    DONE = "done"              # Completed successfully
    FAIL = "fail"              # Completed with error
    INTERRUPT = "interrupt"    # Externally interrupted (resume possible)
    HITL = "hitl"              # Human-in-the-loop, waiting for input


# ---------------------------------------------------------------------------
# Execution state — the live state during a run
# ---------------------------------------------------------------------------


class ExecutionState(BaseModel):
    """
    Full execution state for a single run. Checkpointed periodically to Redis.
    This travels through the Engine but is not visible to Agent SDK.
    """

    # Identity
    org_id: str
    thread_id: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    idem_key: str = ""

    # Current status
    status: RunStatus = RunStatus.CREATED

    # Agent
    agent_id: str = ""

    # Messages (input + accumulated during execution)
    messages: list[AnyMessage] = Field(default_factory=list)

    # Execution progress
    run_id: int = 0
    max_runs: int = 50

    # Streaming
    stream: bool = False

    # Webhook
    webhook: bool = True
    webhook_config: WebhookConfig | None = None

    # Checkpoint data (arbitrary agent state for resume)
    checkpoint_data: dict[str, Any] = Field(default_factory=dict)

    # Raw initial_state as passed on TriggerParams (kept verbatim — Engine
    # merges a copy of this into checkpoint_data on the first run only, see
    # engine._run_resume_check). Read-only from the agent's perspective.
    initial_state: dict[str, Any] = Field(default_factory=dict)

    # Result (set on completion)
    result: Any = None
    error: str | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "org_id": self.org_id,
            "thread_id": self.thread_id,
            "session_id": self.session_id,
            "idem_key": self.idem_key,
            "status": self.status.value,
            "agent_id": self.agent_id,
            "messages": [m.model_dump(exclude_none=True) for m in self.messages],
            "run_id": self.run_id,
            "max_runs": self.max_runs,
            "stream": self.stream,
            "webhook": self.webhook,
            "webhook_config": (
                self.webhook_config.model_dump(exclude_none=True)
                if self.webhook_config else None
            ),
            "checkpoint_data": self.checkpoint_data,
            "initial_state": self.initial_state,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ExecutionState":
        _wh_raw = data.get("webhook_config")
        _webhook_config: WebhookConfig | None = (
            WebhookConfig.model_validate(_wh_raw) if _wh_raw else None
        )
        state = cls(
            org_id=data["org_id"],
            thread_id=data["thread_id"],
            session_id=data["session_id"],
            idem_key=data.get("idem_key", ""),
            status=RunStatus(data["status"]),
            agent_id=data.get("agent_id", ""),
            messages=[parse_message(m) for m in data.get("messages", [])],
            run_id=data.get("run_id", 0),
            max_runs=data.get("max_runs", 50),
            stream=data.get("stream", False),
            webhook=data.get("webhook", True),
            webhook_config=_webhook_config,
            checkpoint_data=data.get("checkpoint_data", {}),
            initial_state=data.get("initial_state", {}),
            result=data.get("result"),
            error=data.get("error"),
        )
        return state


# ---------------------------------------------------------------------------
# Trigger parameters — what kicks off a run
# ---------------------------------------------------------------------------


class TriggerParams(BaseModel):
    """
    All parameters passed when triggering an agent run.
    Flow: Node.js → Runner → Engine.trigger_session()
    """

    # NOTE: despite the name, this is NOT a deduplication key — nothing reads
    # it to detect or reject a duplicate request. It's a fresh uuid4 minted
    # per HTTP call (see api.py's _build_params) and only used for
    # tracing/billing correlation (UsageRecord.idem_key, ExecutionState.idem_key).
    # Request-level idempotency for retries is provided by session_id itself:
    # a client retrying with the same session_id gets serialized by
    # Engine._session_lock and then handled by the normal resume-check status
    # logic (no-op if already DONE/FAIL, resumed if HITL) — see engine.py's
    # module docstring "CONCURRENCY". If true dedup-by-key is ever needed
    # (e.g. detecting retries that use a *different* session_id for the same
    # logical request), this field would need to be client-supplied and
    # checked against a seen-set — it doesn't do that today.
    idem_key: str
    agent_id: str                    # Which agent to run

    # Identity context
    org_id: str
    thread_id: str

    # Pre-generated session_id (optional — Engine generates one if not set).
    # Set by the caller (e.g. POST /call endpoint) so it can return a
    # pollable session_id immediately in fire-and-forget mode.
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Input
    messages: list[AnyMessage] = Field(default_factory=list)

    # Arbitrary initial state for the agent (any shape the agent wants —
    # e.g. domain fields a LangGraph state schema needs beyond `messages`,
    # or config a plain-python agent wants available from run 1). Engine
    # merges this into ExecutionState.checkpoint_data before the first
    # run's resume_check.initial_work() hook fires — see engine.engine and
    # agent_sdk.resume_check.ResumeCheck for the validator/parser pattern.
    # Ignored on resume (checkpoint_data from the previous run wins).
    initial_state: dict[str, Any] = Field(default_factory=dict)

    # I/O config
    stream: bool = False

    # Webhook — set webhook=False to disable all webhook dispatch for this run.
    # Pass a WebhookConfig to enable async notification on run completion for a new endpoint.
    # Only POST is supported. Set max_retries=0 (default) for best-effort delivery.
    webhook: bool = True
    webhook_config: WebhookConfig | None = None

    # Extra metadata
    extras: dict[str, Any] = Field(default_factory=dict)

    # Optional per-request run cap.
    # If set, overrides agent.runner.agent_profile.max_runs for this run only.
    # Use to sandbox a specific request without changing the agent's default config.
    #
    # Bounded [1, MAX_RUNS_HARD_CAP]:
    #   - Previously unbounded, so 0/negative silently made the execution loop
    #     not run at all (no error, just a no-op "done" run — confusing for
    #     callers with no explanation), and values above the hard cap were
    #     silently clamped by engine.py's min(state.max_runs, hard_cap) with
    #     no feedback that the requested value was ignored.
    #   - Now fails fast with a 422 at the API boundary instead of behaving
    #     unexpectedly deep inside the execution loop.
    max_runs: int | None = Field(default=None, ge=1, le=MAX_RUNS_HARD_CAP)


# ---------------------------------------------------------------------------
# Usage record — schema for DB persistence (Section 9 of arch doc)
# ---------------------------------------------------------------------------


class UsageRecord(BaseModel):
    """
    Usage record stored in DB.
    identity + resource + usage + billing fields.
    status='error' is a log flag only — NOT used for alerting.
    """

    # Identity
    org_id: str
    agent_id: str
    thread_id: str
    session_id: str
    run_id: int
    step_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str | None = None
    extras: dict[str, Any] = Field(default_factory=dict)

    # Resource
    resource_type: str = ""           # e.g. "llm", "tool", "connector"
    resource_id: str = ""             # e.g. model name or tool name
    idem_key: str = ""
    cost_fn_version: str = "v1"

    # Usage
    prompt_tokens: int = 0
    completion_tokens: int = 0
    request_count: int = 0

    # Billing
    usage_raw: dict[str, Any] = Field(default_factory=dict)  # jsonb
    credit_cost: float | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "success"          # 'success' | 'error' (log flag only)

    def to_dict(self) -> dict:
        return {
            "org_id": self.org_id,
            "agent_id": self.agent_id,
            "thread_id": self.thread_id,
            "session_id": self.session_id,
            "run_id": self.run_id,
            "step_id": self.step_id,
            "user_id": self.user_id,
            "extras": self.extras,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "idem_key": self.idem_key,
            "cost_fn_version": self.cost_fn_version,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "request_count": self.request_count,
            "usage_raw": self.usage_raw,
            "credit_cost": self.credit_cost,
            "timestamp": self.timestamp.isoformat(),
            "status": self.status,
        }
