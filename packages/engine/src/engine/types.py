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
    proj_id: str
    session_id: str
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    idem_key: str = ""

    # Current status
    status: RunStatus = RunStatus.CREATED

    # Agent
    agent_id: str = ""

    # Messages (input + accumulated during execution)
    messages: list[AnyMessage] = Field(default_factory=list)

    # Execution progress
    iteration: int = 0
    max_iterations: int = 50

    # Streaming
    stream: bool = False

    # Webhook
    webhook: bool = True
    webhook_config: WebhookConfig | None = None

    # Checkpoint data (arbitrary agent state for resume)
    checkpoint_data: dict[str, Any] = Field(default_factory=dict)

    # Result (set on completion)
    result: Any = None
    error: str | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "org_id": self.org_id,
            "proj_id": self.proj_id,
            "session_id": self.session_id,
            "run_id": self.run_id,
            "idem_key": self.idem_key,
            "status": self.status.value,
            "agent_id": self.agent_id,
            "messages": [m.model_dump(exclude_none=True) for m in self.messages],
            "iteration": self.iteration,
            "max_iterations": self.max_iterations,
            "stream": self.stream,
            "webhook": self.webhook,
            "webhook_config": (
                self.webhook_config.model_dump(exclude_none=True)
                if self.webhook_config else None
            ),
            "checkpoint_data": self.checkpoint_data,
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
            proj_id=data["proj_id"],
            session_id=data["session_id"],
            run_id=data["run_id"],
            idem_key=data.get("idem_key", ""),
            status=RunStatus(data["status"]),
            agent_id=data.get("agent_id", ""),
            messages=[parse_message(m) for m in data.get("messages", [])],
            iteration=data.get("iteration", 0),
            max_iterations=data.get("max_iterations", 50),
            stream=data.get("stream", False),
            webhook=data.get("webhook", True),
            webhook_config=_webhook_config,
            checkpoint_data=data.get("checkpoint_data", {}),
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
    Flow: Node.js → Runner → Engine.trigger_run()
    """

    idem_key: str                    # Idempotency key for deduplication
    agent_id: str                    # Which agent to run

    # Identity context
    org_id: str
    proj_id: str
    session_id: str

    # Pre-generated run_id (optional — Engine generates one if not set).
    # Set by the caller (e.g. POST /run endpoint) so it can return a
    # pollable run_id immediately in fire-and-forget mode.
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Input
    messages: list[AnyMessage] = Field(default_factory=list)

    # I/O config
    stream: bool = False

    # Webhook — set webhook=False to disable all webhook dispatch for this run.
    # Pass a WebhookConfig to enable async notification on run completion for a new endpoint.
    # Only POST is supported. Set max_retries=0 (default) for best-effort delivery.
    webhook: bool = True
    webhook_config: WebhookConfig | None = None

    # Extra metadata
    extras: dict[str, Any] = Field(default_factory=dict)

    # Optional per-request iteration cap.
    # If set, overrides agent.runner.agent_profile.max_iterations for this run only.
    # Use to sandbox a specific request without changing the agent's default config.
    max_iterations: int | None = None


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
    proj_id: str
    session_id: str
    run_id: str
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
            "proj_id": self.proj_id,
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
