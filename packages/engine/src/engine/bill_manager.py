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
  Local state = fast path for bill_check on every iteration.
  Redis sync = eventual consistency across potential parallel executions.
  No hard cap enforcement: developer can pay for slight overages, then add credit.
"""
from __future__ import annotations

import asyncio
from typing import Any

import redis.asyncio as aioredis
from loguru import logger

_BUDGET_KEY_PREFIX = "bill:budget:"
_CONSUMED_KEY_PREFIX = "bill:consumed:"


class BillManager:
    """
    Budget tracking. NEVER exposed outside Engine.

    Local budget state + Redis sync = eventual consistency.
    The execution loop calls is_budget_exceeded() on every iteration.
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        default_budget: float = 10.0,  # default credits per org/run
    ) -> None:
        self._redis = redis
        self._default_budget = default_budget

        # Local state (fast path, eventually consistent with Redis)
        self._allocated: float = default_budget
        self._consumed: float = 0.0
        # Tracks how much has already been flushed to Redis so sync_records only
        # pushes the *delta* (new spend since last sync) via INCRBYFLOAT.
        self._last_synced: float = 0.0

    # ------------------------------------------------------------------
    # Budget checks — called by Engine on every execution loop iteration
    # ------------------------------------------------------------------

    def is_budget_exceeded(self) -> bool:
        """
        Fast local check. Called at top of every execution loop iteration.
        Returns True if consumed >= allocated (stop the run).
        Slight overshoot is accepted (eventual consistency).
        """
        return self._consumed >= self._allocated

    def get_remaining_budget(self) -> float:
        return max(0.0, self._allocated - self._consumed)

    # ------------------------------------------------------------------
    # Consumption — called by UsageTracker.log() via budget_consume()
    # ------------------------------------------------------------------

    def budget_consume(self, cost: float) -> None:
        """
        Record cost against local budget. Called when UsageTracker logs a success.
        Syncing to Redis is done separately (periodic or on completion).
        """
        self._consumed += cost
        logger.debug(
            "BillManager: consumed={:.4f} total={:.4f} allocated={:.4f}",
            cost, self._consumed, self._allocated,
        )

    # ------------------------------------------------------------------
    # Allocation — called by Engine at run start (or by admin tools)
    # ------------------------------------------------------------------

    async def load_budget(self, org_id: str, run_id: str) -> None:
        """
        Load the allocated budget for this org/run from Redis.
        If not set, uses the default budget.
        Called once at the start of a run.
        """
        key = f"{_BUDGET_KEY_PREFIX}{org_id}"
        try:
            val = await self._redis.get(key)
            if val is not None:
                self._allocated = float(val)
        except Exception as e:
            logger.warning("BillManager: failed to load budget | org={} err={}", org_id, e)

        # Also restore any previously consumed amount (resume scenario)
        consumed_key = f"{_CONSUMED_KEY_PREFIX}{run_id}"
        try:
            val = await self._redis.get(consumed_key)
            if val is not None:
                self._consumed = float(val)
                # Mark as already synced — Redis already holds this value;
                # next sync_records will only push new delta from this point.
                self._last_synced = self._consumed
        except Exception as e:
            logger.warning("BillManager: failed to load consumed | run={} err={}", run_id, e)

    async def sync_records(self, org_id: str, run_id: str) -> None:
        """
        Atomically push the *delta* (new spend since last sync) to Redis.

        Uses INCRBYFLOAT so concurrent parallel executions on the same org each
        add their own delta without overwriting each other — fixing the race
        condition present in the previous SET-based approach.

        No-op if nothing new has been consumed since the last sync.
        """
        delta = self._consumed - self._last_synced
        if delta <= 0:
            return  # nothing new to flush

        consumed_key = f"{_CONSUMED_KEY_PREFIX}{run_id}"
        try:
            new_total = await self._redis.incrbyfloat(consumed_key, delta)
            # Reset TTL on every sync so long-running agents don't lose their counter.
            await self._redis.expire(consumed_key, 86400)  # 24 h
            self._last_synced = self._consumed  # mark delta as committed
            logger.debug(
                "BillManager: synced delta={:.4f} redis_total={:.4f} | run={}",
                delta, new_total, run_id,
            )
        except Exception as e:
            logger.warning("BillManager: sync failed | run={} err={}", run_id, e)

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
