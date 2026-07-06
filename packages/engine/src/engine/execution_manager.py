"""
engine.execution_manager
~~~~~~~~~~~~~~~~~~~~~~~~
ExecutionManager — status tracking, checkpoint, dump, webhook.

Responsibilities:
  - get/set run status in Redis
  - periodic checkpoint dump to Redis (every N iterations)
  - final data dump: Redis → dump queue → S3 (remaining), metadata on DB
  - checkpoint restore: reload state from Redis on resume
  - HITL action loading
  - webhook dispatch on completion
  - fetch org webhook entries from DB

Everything here is infrastructure-facing. Engine calls this; Agent SDK never sees it.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

import httpx
import redis.asyncio as aioredis
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.db import SessionMetadataModel, WebhookEntryModel
from engine.types import ExecutionState, RunStatus, WebhookConfig

_STATUS_KEY = "session:status:{session_id}"
_CHECKPOINT_KEY = "session:checkpoint:{session_id}"
_HITL_KEY = "session:hitl:{session_id}"
_S3_DUMP_PREFIX = "sessions/{session_id}/checkpoint.json"
_DUMP_QUEUE_KEY = "engine:dump_queue"  # Redis list — session_ids waiting for S3 upload

CHECKPOINT_EVERY_N = 5  # periodic checkpoint every N iterations

# Webhook HTTP timeouts (seconds)
CONNECTION_TIMEOUT = 5.0  # max time to establish the TCP connection
REQUEST_TIMEOUT = 30.0  # max time for the full request (connect + transfer)


class ExecutionManager:
    """
    Manages execution lifecycle: status, checkpoints, dumps, webhooks.
    All methods are async — Engine awaits them.
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
        s3_client: Any,  # boto3 S3 client
        s3_bucket: str = "agent-runs",
    ) -> None:
        self._redis = redis
        self._db = db_session_factory
        self._s3 = s3_client
        self._s3_bucket = s3_bucket

    # ------------------------------------------------------------------
    # Status — Redis-backed
    # ------------------------------------------------------------------

    async def get_status(self, session_id: str) -> RunStatus:
        """Get current run status from Redis."""
        key = _STATUS_KEY.format(session_id=session_id)
        try:
            val = await self._redis.get(key)
            if val is not None:
                return RunStatus(val.decode() if isinstance(val, bytes) else val)
        except Exception as e:
            logger.warning(
                "ExecutionManager: failed to get status for session={}: {}",
                session_id,
                e,
            )
        return RunStatus.CREATED

    async def set_status(self, session_id: str, status: RunStatus) -> None:
        """Set run status in Redis."""
        key = _STATUS_KEY.format(session_id=session_id)
        try:
            await self._redis.set(key, status.value, ex=86400 * 7)  # 7-day TTL
            logger.info(
                "ExecutionManager: session={} status → {}", session_id, status.value
            )
        except Exception as e:
            logger.error(
                "ExecutionManager: failed to set status for session={}: {}",
                session_id,
                e,
            )

    # ------------------------------------------------------------------
    # Checkpoint — periodic dump to Redis
    # ------------------------------------------------------------------

    async def periodic_dump(self, state: ExecutionState) -> None:
        """
        Checkpoint state to Redis. Called every N iterations by Engine.
        Only dumps if state.run_id % CHECKPOINT_EVERY_N == 0.
        """
        if state.run_id % CHECKPOINT_EVERY_N != 0:
            return
        await self._save_checkpoint(state)

    async def _save_checkpoint(self, state: ExecutionState) -> None:
        """Save full execution state to Redis."""
        key = _CHECKPOINT_KEY.format(session_id=state.session_id)
        try:
            data = json.dumps(state.to_dict(), default=str)
            await self._redis.set(key, data, ex=86400 * 3)  # 3-day TTL
            logger.debug(
                f"ExecutionManager: checkpoint saved for session={state.session_id} iter={state.run_id}"
            )
        except Exception as e:
            logger.error(
                "ExecutionManager: checkpoint save failed for session={}: {}",
                state.session_id,
                e,
            )

    async def checkpoint_restore(self, session_id: str) -> ExecutionState | None:
        """
        Restore execution state from Redis checkpoint.
        Returns None if no checkpoint found (Engine then raises or starts fresh).
        """
        key = _CHECKPOINT_KEY.format(session_id=session_id)
        try:
            data = await self._redis.get(key)
            if data is None:
                return None
            raw = json.loads(data.decode() if isinstance(data, bytes) else data)
            return ExecutionState.from_dict(raw)
        except Exception as e:
            logger.error(
                "ExecutionManager: checkpoint restore failed for session={}: {}",
                session_id,
                e,
            )
            return None

    # ------------------------------------------------------------------
    # HITL
    # ------------------------------------------------------------------

    async def load_hitl_actions(self, session_id: str) -> list[dict]:
        """
        Load HITL actions for a run from Redis.
        Returns list of action dicts with 'status' field.
        """
        key = _HITL_KEY.format(session_id=session_id)
        try:
            data = await self._redis.get(key)
            if data is None:
                return []
            return json.loads(data.decode() if isinstance(data, bytes) else data)
        except Exception as e:
            logger.warning(
                "ExecutionManager: failed to load HITL actions for session={}: {}",
                session_id,
                e,
            )
            return []

    async def store_hitl_actions(self, session_id: str, actions: list[dict]) -> None:
        """
        Persist the list of pending/answered HITL actions for a run.

        This is a full replace, not a merge/append — callers pass the complete
        action list every time:
          - Engine calls this once, with the freshly-raised actions, the
            moment an ExecutionStep signals StepStatus.HITL (see
            Engine._run_execution_loop). This was previously a dead code path:
            load_hitl_actions() had no writer counterpart, so a run could
            enter RunStatus.HITL but nothing ever populated the actions a
            human is meant to answer.
          - The application layer calls this again later (via
            Engine.submit_hitl_response) with the same actions plus a
            `response`/answer attached to each, once a human has acted.
        """
        key = _HITL_KEY.format(session_id=session_id)
        try:
            await self._redis.set(key, json.dumps(actions, default=str), ex=86400 * 7)
            logger.info(
                "ExecutionManager: session={} hitl_actions stored ({} action(s))",
                session_id,
                len(actions),
            )
        except Exception as e:
            logger.error(
                "ExecutionManager: failed to store HITL actions for session={}: {}",
                session_id,
                e,
            )

    # ------------------------------------------------------------------
    # Final dump — Redis checkpoint → Dump Queue → S3, metadata on DB
    # ------------------------------------------------------------------

    async def dump_data(self, state: ExecutionState) -> None:
        """
        Final data dump after execution reaches a terminal or persistent state
        (done, fail, interrupt, or HITL).

        1. Save final checkpoint to Redis (authoritative fast-path store)
        2. Enqueue session_id to dump queue — background worker uploads to S3
        3. Write metadata to DB (always, regardless of S3 outcome)

        Dumping at HITL is critical: HITL can last hours or days, well beyond
        the Redis checkpoint TTL. DB + S3 provide long-term storage.
        """
        # Step 1: final checkpoint to Redis
        await self._save_checkpoint(state)

        # Step 2: enqueue for async S3 upload via dump queue
        await self._enqueue_dump(state.session_id)

        # Step 3: metadata to DB
        await self._write_run_metadata(state)

    async def _enqueue_dump(self, session_id: str) -> None:
        """
        Push session_id onto the dump queue (Redis list).
        A background worker (Runner._run_dump_worker) pops items and uploads to S3.
        Falls back to a direct in-band upload if the enqueue fails so data is never lost.
        """
        try:
            await self._redis.rpush(_DUMP_QUEUE_KEY, session_id)
            logger.debug(
                "ExecutionManager: session={} enqueued for S3 dump", session_id
            )
        except Exception as e:
            logger.error(
                "ExecutionManager: enqueue failed for session={} — falling back to direct S3 upload: {}",
                session_id,
                e,
            )
            # Fallback: direct upload so state isn't silently dropped
            await self._direct_dump_to_s3(session_id)

    async def process_dump_queue(self, batch_size: int = 10) -> int:
        """
        Pop and process items from the dump queue.

        For each session_id:
          1. Load raw checkpoint bytes from Redis (already serialised JSON)
          2. Upload to S3 via asyncio.to_thread — never blocks the event loop

        Returns the number of items processed.
        Called by Runner's background dump worker (every ~5 seconds).
        """
        processed = 0
        for _ in range(batch_size):
            item = await self._redis.lpop(_DUMP_QUEUE_KEY)
            if item is None:
                break
            session_id = item.decode() if isinstance(item, bytes) else item
            await self._direct_dump_to_s3(session_id)
            processed += 1
        return processed

    async def _direct_dump_to_s3(self, session_id: str) -> None:
        """
        Load the run's checkpoint from Redis and upload to S3.

        Uses asyncio.to_thread() so the synchronous boto3 put_object call never
        blocks the asyncio event loop — fixing the previous inline blocking call.

        The checkpoint bytes are uploaded as-is (already serialised JSON), so
        no extra deserialisation round-trip is needed.
        """
        s3_key = _S3_DUMP_PREFIX.format(session_id=session_id)
        checkpoint_key = _CHECKPOINT_KEY.format(session_id=session_id)
        try:
            data = await self._redis.get(checkpoint_key)
            if data is None:
                logger.warning(
                    "ExecutionManager: no checkpoint in Redis for session={} — S3 dump skipped",
                    session_id,
                )
                return
            payload: bytes = data if isinstance(data, bytes) else data.encode()
            # boto3 put_object is synchronous — run it in a thread pool to avoid
            # blocking the event loop during network I/O.
            await asyncio.to_thread(
                self._s3.put_object,
                Bucket=self._s3_bucket,
                Key=s3_key,
                Body=payload,
                ContentType="application/json",
            )
            logger.info(
                "ExecutionManager: S3 dump complete | session={} key={}",
                session_id,
                s3_key,
            )
        except Exception as e:
            logger.error(
                "ExecutionManager: S3 dump failed for session={}: {}", session_id, e
            )

    async def _write_run_metadata(self, state: ExecutionState) -> None:
        """Write final run metadata to DB."""
        try:
            async with self._db() as session:
                # Upsert: check if record exists
                from sqlalchemy import select

                result = await session.execute(
                    select(SessionMetadataModel).where(
                        SessionMetadataModel.session_id == state.session_id
                    )
                )
                existing = result.scalar_one_or_none()

                if existing:
                    existing.status = state.status.value
                    existing.error = state.error
                    existing.run_count = state.run_id
                    existing.completed_at = datetime.now(timezone.utc)
                    existing.result_summary = (
                        str(state.result)[:1000] if state.result else None
                    )
                else:
                    metadata = SessionMetadataModel(
                        session_id=state.session_id,
                        thread_id=state.thread_id,
                        org_id=state.org_id,
                        agent_id=state.agent_id,
                        status=state.status.value,
                        idem_key=state.idem_key,
                        error=state.error,
                        run_count=state.run_id,
                        created_at=state.created_at,
                        result_summary=str(state.result)[:1000]
                        if state.result
                        else None,
                    )
                    session.add(metadata)

                await session.commit()
                logger.info(
                    "ExecutionManager: metadata written for session={}",
                    state.session_id,
                )
        except Exception as e:
            logger.error(
                "ExecutionManager: failed to write metadata for session={}: {}",
                state.session_id,
                e,
            )

    # ------------------------------------------------------------------
    # Webhook dispatch
    # ------------------------------------------------------------------

    async def fetch_org_webhook_entries(
        self, org_id: str, session_id: str
    ) -> list[dict]:
        """
        Fetch webhook entries from DB for this org + run.
        Returns list of dicts with full WebhookConfig fields:
          'url', 'headers', 'signature_header', 'signature_secret', 'signature_algorithm'.
        """
        try:
            async with self._db() as session:
                from sqlalchemy import select

                result = await session.execute(
                    select(WebhookEntryModel).where(
                        WebhookEntryModel.org_id == org_id,
                        WebhookEntryModel.session_id == session_id,
                        WebhookEntryModel.is_active == True,  # noqa: E712
                    )
                )
                entries = result.scalars().all()
                return [
                    {
                        "url": e.url,
                        "org_id": e.org_id,
                        "headers": e.headers or {},
                        "signature_header": e.signature_header,
                        "signature_secret": e.signature_secret,
                        "signature_algorithm": e.signature_algorithm,
                    }
                    for e in entries
                ]
        except Exception as e:
            logger.error("ExecutionManager: failed to fetch webhook entries: {}", e)
            return []

    async def store_webhook_entry(
        self, org_id: str, session_id: str, thread_id: str, config: WebhookConfig
    ) -> None:
        """Persist a webhook entry (including headers + signature config) at run start."""
        try:
            async with self._db() as session:
                sig = config.signature
                entry = WebhookEntryModel(
                    org_id=org_id,
                    session_id=session_id,
                    thread_id=thread_id,
                    url=config.url,
                    headers=config.headers or {},
                    signature_header=sig.header_name if sig else None,
                    signature_secret=sig.secret if sig else None,
                    signature_algorithm=sig.algorithm if sig else None,
                )
                session.add(entry)
                await session.commit()
        except Exception as e:
            logger.error("ExecutionManager: failed to store webhook entry: {}", e)

    async def send_webhook(
        self,
        thread_id: str,
        session_id: str,
        status: str,
        url: str,
        headers: dict[str, str] | None = None,
        signature_header: str | None = None,
        signature_secret: str | None = None,
        signature_algorithm: str | None = None,
    ) -> bool:
        """
        Send a webhook notification via HTTP POST.

        - Merges caller-supplied ``headers`` into the request.
        - If a ``signature_header`` + ``signature_secret`` are provided, computes
          HMAC-SHA256 over the JSON body and attaches it under ``signature_header``.

        Timeouts: CONNECTION_TIMEOUT for connect, REQUEST_TIMEOUT for full transfer.
        V1: best-effort (no retry). V2: retry via separate queue-based sender.
        """
        payload = {
            "thread_id": thread_id,
            "session_id": session_id,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        body = json.dumps(payload).encode()

        # Build request headers
        request_headers: dict[str, str] = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)

        # Compute HMAC signature if configured
        if signature_header and signature_secret:
            _algo = (signature_algorithm or "sha256").lower()
            sig = hmac.new(
                signature_secret.encode(),
                body,
                getattr(hashlib, _algo, hashlib.sha256),
            ).hexdigest()
            request_headers[signature_header] = f"{_algo}={sig}"

        try:
            timeout = httpx.Timeout(
                connect=CONNECTION_TIMEOUT,
                read=REQUEST_TIMEOUT,
                write=REQUEST_TIMEOUT,
                pool=CONNECTION_TIMEOUT,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, content=body, headers=request_headers)
                resp.raise_for_status()
                logger.info(
                    "ExecutionManager: webhook sent to {} for session={} status={}",
                    url,
                    session_id,
                    status,
                )
                return True
        except Exception as e:
            logger.warning(
                "ExecutionManager: webhook failed for session={} url={}: {}",
                session_id,
                url,
                e,
            )
            return False
