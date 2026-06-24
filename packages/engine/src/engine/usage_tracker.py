"""
engine.usage_tracker
~~~~~~~~~~~~~~~~~~~~
UsageTracker — usage logging. Exposed as engine.usage_tracker.

This is the ONLY billing-adjacent object that leaves Engine.
It is injected into AgentCaller instances by Runner at trigger time.

Implements UsageTrackerProtocol from agent_sdk.types.

Key design rules:
  - status='error' in UsageRecord is a log flag ONLY.
  - Alerting is triggered by Engine's ErrorHandler, NOT by UsageTracker reading this field.
  - Records usage on DB (async, fire-and-forget safe).
  - Calls bill_manager.budget_consume(cost) whenever credit_cost is known
    (not only on success — see NOTE in log()).

FIX SUMMARY vs original:
  1. [CRITICAL] _run_context moved from instance dict → ContextVar.
     Shared singleton + mutable instance dict = silent data corruption under concurrency.
     ContextVar gives per-asyncio-task isolation with zero locking.

  2. [CRITICAL] asyncio.create_task() result now held in self._background_tasks.
     Unreferenced tasks can be GC'd mid-flight (CPython 3.12+ warns explicitly).
     Strong reference kept until task completes via done_callback.

  3. [CRITICAL] caller_extras now written to DB.
     Was present in log_data and printed to stdout but never passed to UsageRecordModel.
     Silent data loss on every write.

  4. [HIGH] Timestamp computed once in log(), reused in _persist_to_db().
     Was two separate datetime.now() calls — log line and DB record had different times.

  5. [HIGH] budget_consume now called whenever credit_cost is not None.
     Was gated on status=='success'. LLM providers charge on many error types
     (timeout after tokens sent, rate-limit after partial generation, etc.).
     Skipping on error caused budget undercounting.

NOT FIXED (intentional, needs broader refactor):
  - No DB retry: transient failures silently drop billing records.
    Proper fix: dead-letter queue or retry with backoff. Out of scope here.
  - Lazy import of UsageRecordModel: symptom of circular dep between engine.db
    and engine.usage_tracker. Needs structural refactor.
  - Singleton + set_run_context() is architecturally odd even with ContextVar.
    Cleaner: pass run_context into log() directly, or construct UsageTracker per-run.
    ContextVar is the minimal safe fix without changing the Engine/Runner contract.
"""

from __future__ import annotations

import asyncio
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from agent_sdk.caller_config import CallerConfig
from agent_sdk.types import CostResult, Usage
from loguru import logger

if TYPE_CHECKING:
    from engine.bill_manager import BillManager


# FIX 1: Module-level ContextVar instead of instance dict.
#
# Why module-level and not instance attribute?
# ContextVar must be defined at module scope (or class scope as a class variable)
# to behave correctly. If defined inside __init__ as self._ctx_var = ContextVar(...),
# each UsageTracker instance gets its own ContextVar object, but the asyncio context
# system keys isolation by ContextVar identity. A new ContextVar per instance is still
# safe, but it's unusual and confusing. Module-level is the standard pattern.
#
# How it works:
# When an asyncio task calls _run_context_var.set(ctx), that write is scoped to that
# task's context. Other concurrent tasks read their own value. No lock needed.
_run_context_var: ContextVar[dict[str, Any]] = ContextVar(
    "usage_tracker_run_context", default={}
)


class UsageTracker:
    """
    Usage logger. Injected into AgentCaller by Runner.
    Implements UsageTrackerProtocol from agent_sdk.

    Concurrent-safe: run context stored in ContextVar, not on the instance.
    Multiple concurrent runs sharing a singleton do not corrupt each other's records.
    """

    def __init__(
        self,
        bill_manager: "BillManager",
        db_session_factory: Any | None = None,
    ) -> None:
        self._bill_manager = bill_manager
        self._db_session_factory = db_session_factory

        # FIX 2: Strong references to in-flight background tasks.
        # asyncio.create_task() does NOT keep a reference. If nothing else does,
        # CPython's GC can collect the task while it's still awaiting a DB write.
        # This set holds tasks alive until their done_callback removes them.
        self._background_tasks: set[asyncio.Task] = set()

    def set_run_context(self, context: dict[str, Any]) -> None:
        """
        Called by Engine before starting a run to set identity context.
        Context keys: org_id, proj_id, session_id, run_id, agent_id, user_id, idem_key.

        FIX 1: Writes to ContextVar, not a shared instance dict.
        Each asyncio task calling this gets its own isolated copy.
        """
        _run_context_var.set(context)

    def log(
        self,
        config: CallerConfig,
        usage: Usage | None,
        cost: CostResult | None,
        status: str,  # 'success' | 'error'
    ) -> None:
        """
        Log usage for an AgentCaller invocation.
        """
        step_id = str(uuid.uuid4())

        # FIX 4: Compute timestamp once.
        # Previously: log_data stored isoformat string, _persist_to_db called
        # datetime.now() again independently. Log line and DB record had different times.
        # Now: single datetime object, passed through to DB.
        timestamp = datetime.now(timezone.utc)

        credit_cost = cost.credit_cost if cost is not None else None

        # FIX 1: Read from ContextVar, not self._run_context.
        ctx = _run_context_var.get()

        resource_type = config.resource_type
        resource_id = config.resource_id
        cost_fn_version = config.cost_fn_version
        caller_extras = config.caller_extras

        log_data: dict[str, Any] = {
            "step_id": step_id,
            "timestamp": timestamp,
            # FIX 1: from ContextVar
            "org_id": ctx.get("org_id", ""),
            "proj_id": ctx.get("proj_id", ""),
            "session_id": ctx.get("session_id", ""),
            "run_id": ctx.get("run_id", ""),
            "agent_id": ctx.get("agent_id", ""),
            "user_id": ctx.get("user_id"),  # intentionally nullable — FK to users table
            "idem_key": ctx.get("idem_key", ""),
            # Resource identity
            "resource_type": resource_type,
            "resource_id": resource_id,
            "cost_fn_version": cost_fn_version,
            "extras": caller_extras,  # FIX 3: was built here but never written to DB
            # Usage
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "request_count": usage.request_count if usage else 0,
            # Billing
            "credit_cost": credit_cost,
            "status": status,
        }

        log_fn = logger.info if status == "success" else logger.warning
        log_fn(
            "USAGE | status={} | run={} | step={} | agent={} | resource={}:{} "
            "| tokens_p={} | tokens_c={} | cost={}",
            status,
            log_data["run_id"],
            step_id,
            log_data["agent_id"],
            resource_type,
            resource_id,
            log_data["prompt_tokens"],
            log_data["completion_tokens"],
            credit_cost,
        )

        # FIX 5: Budget consumption on any status, not only 'success'.
        #
        # Original gated this on status == 'success'. That's wrong because:
        # LLM providers (OpenAI, Anthropic, etc.) charge input tokens on many error
        # types — timeout after tokens were transmitted, rate-limit after partial
        # generation, content filter after processing, etc.
        #
        # Consequence of original: every error-with-cost left the local budget
        # tracker underestimating real spend. Could allow overspend past budget limit.
        #
        # VERIFY: if your cost_fn guarantees credit_cost=None on all errors
        # (i.e. errors are never billed), this change is a no-op. But in that case
        # the original 'success' gate was hiding that invariant rather than
        # enforcing it. Prefer making it explicit in the cost_fn.
        if credit_cost is not None:
            self._bill_manager.budget_consume(credit_cost)

        if self._db_session_factory is not None:
            self._persist_async(log_data, usage, cost)

    def _persist_async(
        self, log_data: dict, usage: Usage | None, cost: CostResult | None
    ) -> None:
        """
        Schedule async DB persistence without blocking the caller.

        FIX 2: Task reference stored in self._background_tasks.
        done_callback removes it once the task completes, so the set doesn't grow
        unbounded across many calls.
        """
        try:
            task = asyncio.create_task(self._persist_to_db(log_data, usage, cost))
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)
        except RuntimeError:
            # No running event loop — e.g. in synchronous tests. Skip DB write.
            logger.warning(
                "UsageTracker: no event loop — DB write skipped | step={}",
                log_data.get("step_id"),
            )

    async def _persist_to_db(
        self, log_data: dict, usage: Usage | None, cost: CostResult | None
    ) -> None:
        """
        Persist a UsageRecord row to the database.

        FIX 3: extras= now passed to UsageRecordModel.
        FIX 4: timestamp= uses log_data["timestamp"], not a fresh datetime.now().

        NOTE (not fixed here): no retry logic. A transient DB failure silently
        drops this billing record. For production billing data consider:
          - Retry with exponential backoff (e.g. tenacity)
          - Dead-letter queue (write to local file/Redis on failure for later replay)
        """
        if self._db_session_factory is None:
            return
        try:
            async with self._db_session_factory() as session:
                from engine.db import (
                    UsageRecordModel,
                )  # lazy import — avoids circular dep

                record = UsageRecordModel(
                    step_id=log_data["step_id"],
                    org_id=log_data["org_id"],
                    proj_id=log_data["proj_id"],
                    session_id=log_data["session_id"],
                    run_id=log_data["run_id"],
                    agent_id=log_data["agent_id"],
                    user_id=log_data.get("user_id"),
                    idem_key=log_data.get("idem_key", ""),
                    resource_type=log_data["resource_type"],
                    resource_id=log_data["resource_id"],
                    cost_fn_version=log_data["cost_fn_version"],
                    extras=log_data["extras"],  # FIX 3: was missing
                    prompt_tokens=log_data["prompt_tokens"],
                    completion_tokens=log_data["completion_tokens"],
                    request_count=log_data["request_count"],
                    usage_raw=usage.raw if usage else {},
                    credit_cost=log_data["credit_cost"],
                    status=log_data["status"],
                    timestamp=log_data["timestamp"],  # FIX 4: single source of truth
                )
                session.add(record)
                await session.commit()
        except Exception as e:
            logger.error(
                "UsageTracker: DB persist failed | step={} err={}",
                log_data.get("step_id"),
                e,
            )
