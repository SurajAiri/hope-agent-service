"""
engine.bill_manager
~~~~~~~~~~~~~~~~~~~~
BillManager — budget tracking. NEVER leaves Engine.

Key design rules (non-negotiable):
  - Created by Engine internally.
  - Never exposed outside Engine (no property, no getter, not passed to Runner).
  - UsageTracker holds a reference to BillManager (for budget_consume on log).
  - Uses Redis for sync_records (eventual consistency — accepted overshoot).

Budget tracking is local-first + periodic Redis sync:
  Local state = fast path for bill_check on every run.
  Redis sync = eventual consistency across potential parallel executions.
  No hard cap enforcement: developer can pay for slight overages, then add credit.

CONCURRENCY FIX (see engine.py / usage_tracker.py for the sibling fix this
mirrors):
  Engine is a singleton — one BillManager instance serves every concurrent
  session, across every org, for the lifetime of the process. The original
  implementation kept `_allocated` / `_consumed` / `_last_synced` as plain
  instance attributes on BillManager itself. Under any real concurrency
  (two sessions, any two orgs, running at the same time — which this
  platform explicitly supports via fire-and-forget /call and SSE) those
  attributes get overwritten by whichever session last called load_budget(),
  and every budget_consume() call from every in-flight session adds into the
  same float. That's cross-tenant billing corruption, not "eventual
  consistency" — a completely different (much worse) failure mode than the
  one the local-first design was accepting.

  Fix: local cache is now keyed by session_id (`self._sessions: dict[str,
  _SessionBudget]`), so each concurrent run gets its own isolated slice of
  local state. Redis remains the cross-run source of truth exactly as
  before — this only fixes the in-process cache's scoping, not the sync
  strategy.

  Engine must call `release(session_id)` once a session's trigger_session()
  call finishes (after the final sync_records()) so this dict doesn't grow
  unbounded for the life of the process. If a session later resumes (new
  trigger_session() call for the same session_id after INTERRUPT/HITL),
  load_budget() rebuilds its entry fresh from Redis — consistent with the
  existing resume design.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import redis.asyncio as aioredis
from loguru import logger

_BUDGET_KEY_PREFIX = "bill:budget:"
_CONSUMED_KEY_PREFIX = "bill:consumed:"


@dataclass
class _SessionBudget:
    """Local-cache budget state for a single in-flight session."""

    allocated: float
    consumed: float = 0.0
    # How much of `consumed` has already been flushed to Redis — sync_records
    # only pushes the delta since this value via INCRBYFLOAT.
    last_synced: float = 0.0


class BillManager:
    """
    Budget tracking. NEVER exposed outside Engine.

    Local budget state (per session_id) + Redis sync = eventual consistency.
    The execution loop calls is_budget_exceeded(session_id) on every run.
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        default_budget: float = 10.0,  # default credits per org/session
    ) -> None:
        self._redis = redis
        self._default_budget = default_budget

        # Per-session local state (fast path, eventually consistent with Redis).
        # Keyed by session_id so concurrent sessions never share the same floats.
        self._sessions: dict[str, _SessionBudget] = {}

    def _get_or_create(self, session_id: str) -> _SessionBudget:
        """Return this session's local budget entry, creating a default one if missing."""
        budget = self._sessions.get(session_id)
        if budget is None:
            budget = _SessionBudget(allocated=self._default_budget)
            self._sessions[session_id] = budget
        return budget

    # ------------------------------------------------------------------
    # Budget checks — called by Engine on every execution loop run
    # ------------------------------------------------------------------

    def is_budget_exceeded(self, session_id: str) -> bool:
        """
        Fast local check. Called at top of every execution loop run.
        Returns True if consumed >= allocated (stop the run).
        Slight overshoot is accepted (eventual consistency).
        """
        budget = self._sessions.get(session_id)
        if budget is None:
            # load_budget() hasn't run yet for this session — nothing consumed,
            # can't be exceeded.
            return False
        return budget.consumed >= budget.allocated

    def get_remaining_budget(self, session_id: str) -> float:
        budget = self._sessions.get(session_id)
        if budget is None:
            return self._default_budget
        return max(0.0, budget.allocated - budget.consumed)

    # ------------------------------------------------------------------
    # Consumption — called by UsageTracker.log() via budget_consume()
    # ------------------------------------------------------------------

    def budget_consume(self, session_id: str, cost: float) -> None:
        """
        Record cost against this session's local budget. Called when
        UsageTracker logs any call with a known credit_cost.
        Syncing to Redis is done separately (periodic or on completion).
        """
        if not session_id:
            # Defensive: should never happen (Engine always sets session
            # context before the loop runs), but never silently attribute
            # spend to a fabricated "" session key.
            logger.warning("BillManager: budget_consume called with empty session_id — dropped cost={:.4f}", cost)
            return
        budget = self._get_or_create(session_id)
        budget.consumed += cost
        logger.debug(
            "BillManager: session={} consumed={:.4f} total={:.4f} allocated={:.4f}",
            session_id, cost, budget.consumed, budget.allocated,
        )

    # ------------------------------------------------------------------
    # Allocation — called by Engine at run start (or by admin tools)
    # ------------------------------------------------------------------

    async def load_budget(self, org_id: str, session_id: str) -> None:
        """
        Load the allocated budget for this org/session from Redis into this
        session's local entry. If not set, uses the default budget.
        Called once at the start of a run (trigger_session).
        """
        budget = self._get_or_create(session_id)

        key = f"{_BUDGET_KEY_PREFIX}{org_id}"
        try:
            val = await self._redis.get(key)
            if val is not None:
                budget.allocated = float(val)
        except Exception as e:
            logger.warning("BillManager: failed to load budget | org={} err={}", org_id, e)

        # Also restore any previously consumed amount (resume scenario)
        consumed_key = f"{_CONSUMED_KEY_PREFIX}{session_id}"
        try:
            val = await self._redis.get(consumed_key)
            if val is not None:
                budget.consumed = float(val)
                # Mark as already synced — Redis already holds this value;
                # next sync_records will only push new delta from this point.
                budget.last_synced = budget.consumed
        except Exception as e:
            logger.warning("BillManager: failed to load consumed | session={} err={}", session_id, e)

    async def sync_records(self, org_id: str, session_id: str) -> None:
        """
        Atomically push the *delta* (new spend since last sync) to Redis for
        this session.

        Uses INCRBYFLOAT so concurrent parallel executions on the same org each
        add their own delta without overwriting each other.

        No-op if this session has no local entry, or nothing new has been
        consumed since the last sync.
        """
        budget = self._sessions.get(session_id)
        if budget is None:
            return

        delta = budget.consumed - budget.last_synced
        if delta <= 0:
            return  # nothing new to flush

        consumed_key = f"{_CONSUMED_KEY_PREFIX}{session_id}"
        try:
            new_total = await self._redis.incrbyfloat(consumed_key, delta)
            # Reset TTL on every sync so long-running agents don't lose their counter.
            await self._redis.expire(consumed_key, 86400)  # 24 h
            budget.last_synced = budget.consumed  # mark delta as committed
            logger.debug(
                "BillManager: synced delta={:.4f} redis_total={:.4f} | session={}",
                delta, new_total, session_id,
            )
        except Exception as e:
            logger.warning("BillManager: sync failed | session={} err={}", session_id, e)

    def release(self, session_id: str) -> None:
        """
        Drop this session's local budget entry.

        Must be called once trigger_session() reaches a terminal point for
        this invocation (after the final sync_records()) — otherwise
        self._sessions grows by one entry per session for the life of the
        process. Safe to call even if the session was never loaded (no-op).

        If the session later resumes (new trigger_session() call after
        INTERRUPT/HITL), load_budget() rebuilds a fresh entry from Redis, so
        releasing here does not lose any committed state.
        """
        self._sessions.pop(session_id, None)

    def calculate_cost(self, usage: Any, cost_fn_version: str = "v1") -> float:
        """
        Default cost calculation.
        V1: simple token-based pricing.
        Developers override at AgentCaller._calc_cost() level for custom pricing.
        """
        if usage is None:
            return 0.0
        prompt_cost = getattr(usage, "prompt_tokens", 0) * 0.000001  # $1 per 1M tokens
        completion_cost = getattr(usage, "completion_tokens", 0) * 0.000002
        return prompt_cost + completion_cost
