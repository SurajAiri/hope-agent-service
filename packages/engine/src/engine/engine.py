"""
engine.engine
~~~~~~~~~~~~~
Engine — the core singleton. Foundation of everything.

Key design rules (non-negotiable):
  1. Singleton — created once by Runner, never recreated per request.
  2. Receives injected infrastructure (redis, db, s3). NEVER creates them.
  3. Creates BillManager and UsageTracker internally.
  4. BillManager NEVER leaves Engine.
  5. UsageTracker exposed as engine.usage_tracker (the only billing-adjacent object that leaves).
  6. Engine controls the full execution flow — ResumeCheck hooks fire through Engine, not themselves.
  7. On AgentCaller exception: catch → ErrorHandler.alert() → set status FAIL → dump → done.
  8. trigger_session() takes an Agent object (not raw components) — Runner builds and passes it.

Execution flow (from arch):
  trigger_session(params, agent) →
    resume check (status → hitl | queue/created [agent.validate_input() fires here,
      first run only — see agent_sdk.agent.BaseAgent] | resume) →
    execution loop (bill check → interrupt check → ExecutionStep.run → checkpoint) →
    post execution (error or status set) →
    dump data (redis → s3, metadata on db) →
    webhook (if enabled)

CONCURRENCY — per-session_id lock (single-process only):
  Engine is a singleton, but nothing previously stopped two concurrent
  trigger_session() calls for the *same* session_id from both passing the
  resume check and both entering the execution loop (e.g. a client
  double-firing POST /call before the first response comes back). That's
  not hypothetical — it produces double LLM execution/billing, two writers
  racing on the same Redis checkpoint, and a silently-swallowed
  IntegrityError in ExecutionManager._write_run_metadata (session_id is
  DB-unique). BillManager's per-session_id dict fix is correct but only
  protects the budget cache; it doesn't stop the double execution itself.

  Fix: _session_lock(session_id) below serializes the *entire*
  trigger_session() body per session_id. A second call for the same
  session_id blocks until the first reaches a terminal/HITL status: it
  then reads that status via the normal resume-check path and no-ops or
  resumes correctly instead of re-running. This also gives idempotent
  replay behavior "for free" for retries that reuse the same session_id —
  no separate idempotency-key system needed for a single-process
  deployment.

  Scope: this is an in-process asyncio.Lock, keyed by session_id, with a
  refcount so the dict doesn't grow unbounded for the process lifetime.
  It does NOT protect against two *different* Engine processes (e.g.
  multiple runner replicas) executing the same session_id concurrently —
  that needs a distributed lock (Redis SETNX/Lua-release + TTL renewal),
  deliberately deferred until there's an actual multi-instance deployment
  to build and test it against. The seam is here (_session_lock) so that
  swap is local to this method when the time comes.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import redis.asyncio as aioredis
from agent_sdk.agent import Agent
from agent_sdk.execution_step import StepContext, StepStatus
from agent_sdk.hitl import HitlResponseInput
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from engine.bill_manager import BillManager
from engine.error_handler import AlertContext, ErrorHandler
from engine.execution_manager import ExecutionManager
from engine.types import MAX_RUNS_HARD_CAP, ExecutionState, RunStatus, TriggerParams
from engine.usage_tracker import UsageTracker


class Engine:
    """
    Core execution singleton. Created once by Runner at startup.

    Args:
        redis:          Async Redis client (injected by Runner)
        db_engine:      SQLAlchemy async engine (injected by Runner)
        s3_client:      boto3 S3 client (injected by Runner)
        s3_bucket:      S3/MinIO bucket name
        default_budget: Default credit budget per run
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        db_engine: AsyncEngine,
        s3_client: Any,
        s3_bucket: str = "agent-runs",
        default_budget: float = 10.0,
    ) -> None:
        self._redis = redis
        self._db_engine = db_engine
        self._s3 = s3_client

        # DB session factory
        self._db_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            db_engine, expire_on_commit=False
        )

        # Internal components — BillManager NEVER leaves this class
        self._bill_manager = BillManager(redis=redis, default_budget=default_budget)

        # UsageTracker is the ONLY thing that leaves Engine (as engine.usage_tracker)
        self._usage_tracker = UsageTracker(
            bill_manager=self._bill_manager,
            db_session_factory=self._db_session_factory,
        )

        # Other internal components
        self._execution_manager = ExecutionManager(
            redis=redis,
            db_session_factory=self._db_session_factory,
            s3_client=s3_client,
            s3_bucket=s3_bucket,
        )
        self._error_handler = ErrorHandler()

        # Per-session_id in-process locks — see module docstring "CONCURRENCY".
        # Guards the whole trigger_session() body so two concurrent calls for
        # the same session_id can't both enter the execution loop. Refcounted
        # so the dicts don't grow unbounded for the life of the process.
        self._session_locks: dict[str, asyncio.Lock] = {}
        self._session_lock_refs: dict[str, int] = {}

        logger.info("Engine: initialized (singleton) | bucket={}", s3_bucket)

    # ------------------------------------------------------------------
    # Per-session lock — see module docstring "CONCURRENCY"
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def _session_lock(self, session_id: str) -> AsyncIterator[None]:
        """
        Serialize all trigger_session() calls for a single session_id.

        In-process only (asyncio.Lock) — does not span multiple Engine
        processes. See module docstring for why that's an acceptable
        scope for now and what to swap in when it isn't.

        Refcounted cleanup: the lock object itself is removed from
        _session_locks once no caller is holding or waiting on it, so a
        long-lived process doesn't accumulate one Lock per session_id
        forever. Safe under single-threaded asyncio because dict
        mutations here never straddle an `await`.
        """
        self._session_lock_refs[session_id] = (
            self._session_lock_refs.get(session_id, 0) + 1
        )
        lock = self._session_locks.setdefault(session_id, asyncio.Lock())
        try:
            async with lock:
                yield
        finally:
            self._session_lock_refs[session_id] -= 1
            if self._session_lock_refs[session_id] == 0:
                del self._session_lock_refs[session_id]
                del self._session_locks[session_id]

    @property
    def usage_tracker(self) -> UsageTracker:
        """
        The ONLY billing-adjacent object that leaves Engine.
        Runner injects this into all AgentCaller instances.
        """
        return self._usage_tracker

    # ------------------------------------------------------------------
    # Main entry point — called by Runner
    # ------------------------------------------------------------------

    async def trigger_session(
        self,
        params: TriggerParams,
        agent: Agent,
    ) -> ExecutionState:
        """
        Full execution flow for one agent run.
        Runner calls this with the Agent object fully wired (deps injected).

        Serialized per session_id (see module docstring "CONCURRENCY") — a
        second concurrent call for the same session_id blocks here until the
        first reaches a terminal/HITL status, then proceeds through the
        normal resume-check path (no-op if DONE/FAIL, resume if HITL) instead
        of re-entering the execution loop alongside the first call.

        Returns the final ExecutionState (for Runner to send response).
        """
        async with self._session_lock(params.session_id):
            return await self._trigger_session_locked(params, agent)

    async def _trigger_session_locked(
        self,
        params: TriggerParams,
        agent: Agent,
    ) -> ExecutionState:
        """
        The original trigger_session() body — only ever called while holding
        this session_id's lock. See trigger_session() above.
        """
        logger.info(
            "Engine: trigger_session | agent={} org={} thread={} session={} stream={}",
            params.agent_id,
            params.org_id,
            params.thread_id,
            params.session_id,
            params.stream,
        )

        # Build initial state — run_id comes from params (pre-generated by caller)
        # so fire-and-forget clients can poll immediately with the returned run_id.
        #
        # max_runs: prefer TriggerParams override (per-request cap), else
        # agent's AgentProfile setting, else ExecutionState default (50).
        _profile_max_iter = getattr(
            getattr(agent.runner, "agent_profile", None),
            "max_runs",
            50,
        )
        _effective_max_iter = (
            params.max_runs if params.max_runs is not None else _profile_max_iter
        )
        state = ExecutionState(
            org_id=params.org_id,
            thread_id=params.thread_id,
            session_id=params.session_id,
            idem_key=params.idem_key,
            agent_id=params.agent_id,
            messages=list(params.messages),
            initial_state=dict(params.initial_state),
            stream=params.stream,
            webhook=params.webhook,
            webhook_config=params.webhook_config,
            max_runs=_effective_max_iter,
        )

        # Inject run context into UsageTracker (so all logs are tagged with this run)
        self._usage_tracker.set_session_context(
            {
                "org_id": params.org_id,
                "agent_id": params.agent_id,
                "thread_id": params.thread_id,
                "session_id": state.session_id,
                "idem_key": params.idem_key,
                "run_id": state.run_id,
            }
        )

        # Load budget for this org/run
        await self._bill_manager.load_budget(params.org_id, state.session_id)

        # Store webhook entry if needed
        if params.webhook and params.webhook_config:
            await self._execution_manager.store_webhook_entry(
                org_id=params.org_id,
                session_id=state.session_id,
                thread_id=params.thread_id,
                config=params.webhook_config,
            )

        # --- RESUME CHECK ---
        should_run = await self._run_resume_check(state, agent)
        if not should_run:
            if state.status == RunStatus.FAIL:
                # A resume_check hook (e.g. an initial_state validator)
                # raised — see _run_resume_check. Treat exactly like an
                # execution-loop failure: alert already logged there, so
                # just make sure this terminal state is persisted and
                # webhooked like any other FAIL.
                logger.warning(
                    "Engine: resume_check failed | session={} error={}",
                    state.session_id,
                    state.error,
                )
                await self._execution_manager.set_status(state.session_id, state.status)
                await self._execution_manager.dump_data(state)
                self._bill_manager.release(state.session_id)
                if params.webhook:
                    await self._dispatch_webhooks(state)
                return state
            if state.status == RunStatus.HITL:
                # HITL can wait hours or days — far beyond Redis TTL.
                # Dump state to DB + S3 now so it survives expiry and can be restored.
                logger.info(
                    "Engine: HITL pending — dumping state for long-term persistence | session={}",
                    state.session_id,
                )
                await self._execution_manager.dump_data(state)
            else:
                # DONE — already completed, don't re-dump.
                logger.info(
                    "Engine: session={} already {} — skipping re-run",
                    state.session_id,
                    state.status.value,
                )
            # This call path never reaches the execution loop's finally block,
            # but load_budget() above still created a local cache entry for
            # this session_id — release it here so a poll against an
            # already-DONE/FAIL session, or a session still waiting on HITL,
            # doesn't leak an entry into BillManager._sessions on every call.
            self._bill_manager.release(state.session_id)
            return state

        # --- EXECUTION LOOP ---
        try:
            state = await self._run_execution_loop(state=state, agent=agent)
        except Exception as error:
            # Unrecoverable error from AgentCaller (already re-raised from inside loop)
            alert_ctx = AlertContext(
                org_id=state.org_id,
                thread_id=state.thread_id,
                session_id=state.session_id,
                agent_id=state.agent_id,
                run_id=state.run_id,
            )
            self._error_handler.alert(error, alert_ctx)
            state.status = RunStatus.FAIL
            state.error = str(error)
        finally:
            # --- POST EXECUTION: set final status ---
            if state.status == RunStatus.WIP:
                # Loop ended without an explicit status set — treat as complete
                state.status = RunStatus.DONE
            await self._execution_manager.set_status(state.session_id, state.status)

            logger.info(
                "Engine: session={} finished | status={} iter={}",
                state.session_id,
                state.status.value,
                state.run_id,
            )

            # --- DUMP DATA ---
            await self._execution_manager.dump_data(state)

            # Final budget sync to Redis
            await self._bill_manager.sync_records(state.org_id, state.session_id)

            # Drop this session's local budget cache entry now that this
            # trigger_session() invocation is done. Without this, BillManager's
            # per-session dict grows by one entry per session for the life of
            # the process. If this session resumes later (INTERRUPT/HITL),
            # load_budget() rebuilds the entry fresh from Redis on the next
            # trigger_session() call, so nothing is lost by releasing here.
            self._bill_manager.release(state.session_id)

        # --- WEBHOOK ---
        if params.webhook:
            await self._dispatch_webhooks(state)

        return state

    # ------------------------------------------------------------------
    # Resume check — Engine controls flow, ResumeCheck provides hooks
    # ------------------------------------------------------------------

    async def _run_resume_check(self, state: ExecutionState, agent: Agent) -> bool:
        """
        Execute resume check logic. Engine owns this control flow.
        agent.resume_check hooks are called here — Engine decides what to do with return values.

        All hooks are async and awaited here. If any hook raises (e.g. a
        developer's initial_work() validating TriggerParams.initial_state
        against a required schema and rejecting it), that's caught, the run
        is set to RunStatus.FAIL with the error message, and this returns
        False — the caller (_trigger_session_locked) persists that FAIL
        exactly like an execution-loop failure instead of letting the
        exception escape trigger_session() uncaught.

        Returns True if the execution loop should run, False if it should be skipped.
        """
        resume_check = agent.resume_check
        current_status = await self._execution_manager.get_status(state.session_id)
        state.status = current_status

        logger.debug(
            "Engine: resume_check | session={} current_status={}",
            state.session_id,
            current_status.value,
        )

        try:
            if current_status == RunStatus.HITL:
                hitl_actions = await self._execution_manager.load_hitl_actions(
                    state.session_id
                )
                state.checkpoint_data["hitl_actions"] = hitl_actions
                completed = await resume_check.hitl_action(state)
                if not completed:
                    logger.info(
                        "Engine: HITL pending | session={} — loop skipped",
                        state.session_id,
                    )
                    return False  # WIP never set, loop won't run

            if current_status in (RunStatus.QUEUE, RunStatus.CREATED):
                logger.info("Engine: first run | session={}", state.session_id)
                # agent.validate_input() is the ONE seam for validating/
                # reshaping the caller-supplied initial_state (see
                # agent_sdk.agent.BaseAgent.validate_input and
                # agent_sdk.input_validator). Runs BEFORE anything touches
                # checkpoint_data and BEFORE resume_check.initial_work() —
                # initial_work stays a general first-run hook (loading
                # thread history, etc.), not a validator; it now just
                # receives already-validated data instead of the raw
                # payload. A raise here (e.g. pydantic ValidationError) is
                # caught by the except block below, same as any other
                # resume-check hook failure.
                validated_state = await agent.validate_input(
                    state.messages, state.initial_state
                )
                if validated_state:
                    state.checkpoint_data.update(validated_state)
                await resume_check.initial_work(state)

            elif current_status not in (RunStatus.DONE):
                # Resuming from interrupt/checkpoint
                logger.info(
                    "Engine: resuming | session={} from_status={}",
                    state.session_id,
                    current_status.value,
                )
                restored = await self._execution_manager.checkpoint_restore(
                    state.session_id
                )
                if restored is not None:
                    state.messages = restored.messages
                    state.run_id = restored.run_id
                    # BUGFIX: restored.checkpoint_data is a stale snapshot captured
                    # at the moment the run paused — BEFORE any human response
                    # existed. If we just fell through from the HITL branch above,
                    # state.checkpoint_data["hitl_actions"] holds the freshly
                    # loaded (possibly now-answered) actions; overwriting
                    # checkpoint_data wholesale would silently throw that away and
                    # hand the agent back its old, unanswered action list. Preserve it.
                    _pending_hitl_actions = state.checkpoint_data.get("hitl_actions")
                    state.checkpoint_data = restored.checkpoint_data
                    if _pending_hitl_actions is not None:
                        state.checkpoint_data["hitl_actions"] = _pending_hitl_actions
                    logger.debug(
                        "Engine: checkpoint restored | session={} iter={}",
                        state.session_id,
                        state.run_id,
                    )
                await resume_check.resume_work(state)

            # Already done — do not re-run
            if current_status in (RunStatus.DONE):
                logger.info(
                    "Engine: session={} already {} — skipping re-run",
                    state.session_id,
                    current_status.value,
                )
                return False

            # Unconditional pre-loop hook (fires on first run AND resume)
            await resume_check.before_run(state)
        except Exception as error:
            alert_ctx = AlertContext(
                org_id=state.org_id,
                thread_id=state.thread_id,
                session_id=state.session_id,
                agent_id=state.agent_id,
                run_id=state.run_id,
            )
            self._error_handler.alert(error, alert_ctx)
            state.status = RunStatus.FAIL
            state.error = f"resume_check hook failed: {error}"
            return False

        # Engine sets WIP AFTER before_run returns
        state.status = RunStatus.WIP
        await self._execution_manager.set_status(state.session_id, RunStatus.WIP)
        logger.info("Engine: session={} → WIP | loop starting", state.session_id)
        return True

    # ------------------------------------------------------------------
    # Execution loop
    # ------------------------------------------------------------------

    async def _run_execution_loop(
        self,
        state: ExecutionState,
        agent: Agent,
    ) -> ExecutionState:
        """
        The execution loop. Runs while status == WIP.

        Each run:
          [1] Bill check → stop if budget exceeded
          [2] Status check → break on interrupt/hitl
          [3] ExecutionStep.run() ← Agent SDK / developer takes over here
          [4] Periodic checkpoint dump (every N iterations)
          [5] Break on COMPLETE / ERROR / INTERRUPTED
        """
        hard_cap = min(state.max_runs, MAX_RUNS_HARD_CAP)

        while state.run_id < hard_cap:
            state.run_id += 1

            # Update context var with current loop index
            self._usage_tracker.set_session_context(
                {
                    "org_id": state.org_id,
                    "agent_id": state.agent_id,
                    "thread_id": state.thread_id,
                    "session_id": state.session_id,
                    "idem_key": state.idem_key,
                    "run_id": state.run_id,
                }
            )

            logger.debug(
                "Engine: loop iter={}/{} | session={}",
                state.run_id,
                hard_cap,
                state.session_id,
            )

            # [1] Bill check — fast local check
            if self._bill_manager.is_budget_exceeded(state.session_id):
                logger.warning(
                    "Engine: budget exceeded | session={} iter={} remaining={:.4f}",
                    state.session_id,
                    state.run_id,
                    self._bill_manager.get_remaining_budget(state.session_id),
                )
                state.status = RunStatus.FAIL
                state.error = "Budget exceeded"
                break

            # [2] External interrupt / HITL check (Redis poll)
            live_status = await self._execution_manager.get_status(state.session_id)
            if live_status in (RunStatus.INTERRUPT, RunStatus.HITL):
                logger.info(
                    "Engine: external {} detected | session={} iter={}",
                    live_status.value,
                    state.session_id,
                    state.run_id,
                )
                state.status = live_status
                break

            # [3] ExecutionStep.run() — developer's code takes over
            # Build StepContext from Engine state (engine types don't leak into agent-sdk)
            step_context = StepContext(
                messages=state.messages,
                stream=state.stream,
                run_id=state.run_id,
                state_data=dict(state.checkpoint_data),
            )
            try:
                step_result = await agent.execution_step.run(
                    agent_runner=agent.runner,
                    agent_context=agent.agent_context,
                    context=step_context,
                )
            except Exception:
                # Re-raise — outer try/except handles alerting + status set
                raise

            # Update messages from step result
            state.messages = step_result.messages

            # Capture final output if step is complete
            if step_result.output is not None:
                state.result = step_result.output

            # Merge any state_data updates from the step into checkpoint_data
            if step_result.state_data is not None:
                state.checkpoint_data.update(step_result.state_data)

            # [4] Periodic checkpoint dump (every N iterations)
            await self._execution_manager.periodic_dump(state)

            # Periodic budget sync to Redis (every 10 iterations)
            if state.run_id % 10 == 0:
                await self._bill_manager.sync_records(state.org_id, state.session_id)

            # [5] Break conditions
            if step_result.status == StepStatus.COMPLETE:
                logger.info(
                    "Engine: COMPLETE | session={} iter={}",
                    state.session_id,
                    state.run_id,
                )
                state.status = RunStatus.DONE
                break

            if step_result.status == StepStatus.ERROR:
                # Read step_result.error first (explicit field), fall back to
                # metadata["error"] for backward compatibility with old steps.
                step_error = step_result.error or step_result.metadata.get(
                    "error", "ExecutionStep returned ERROR"
                )
                logger.error(
                    "Engine: step ERROR | session={} iter={} error={}",
                    state.session_id,
                    state.run_id,
                    step_error,
                )
                state.status = RunStatus.FAIL
                state.error = step_error
                break

            if step_result.status == StepStatus.INTERRUPTED:
                logger.info(
                    "Engine: step INTERRUPTED | session={} iter={}",
                    state.session_id,
                    state.run_id,
                )
                state.status = RunStatus.INTERRUPT
                break

            if step_result.status == StepStatus.HITL:
                # ExecutionStep is asking for human input before it can
                # continue (e.g. a LangGraph interrupt()). Persist the
                # actions the human needs to answer — this is the only
                # writer for the HITL side-channel; without it a run could
                # flip to RunStatus.HITL with nothing for ResumeCheck.hitl_action()
                # to ever read.
                logger.info(
                    "Engine: step HITL | session={} iter={} actions={}",
                    state.session_id,
                    state.run_id,
                    len(step_result.hitl_actions or []),
                )
                await self._execution_manager.store_hitl_actions(
                    state.session_id, step_result.hitl_actions or []
                )
                state.status = RunStatus.HITL
                break

            # StepStatus.CONTINUE → keep looping

        else:
            # While-loop exhausted (iterations reached hard_cap without break)
            logger.warning(
                "Engine: max_runs={} reached without completion | session={}",
                hard_cap,
                state.session_id,
            )
            state.status = RunStatus.FAIL
            state.error = f"Max runs ({hard_cap}) reached without completion"

        return state

    # ------------------------------------------------------------------
    # HITL — public entry point for the application layer
    # ------------------------------------------------------------------

    async def submit_hitl_response(
        self, session_id: str, responses: list[HitlResponseInput]
    ) -> None:
        """
        Attach human responses to a paused (RunStatus.HITL) run.

        `responses` is just the answer(s): action_id + response for whichever
        action(s) a human just answered (agent_sdk.hitl.HitlResponseInput) —
        NOT the full action list. Engine loads the currently-stored actions,
        matches each response to its action by id, and attaches `response` —
        every other field (question/description/options) and every
        not-yet-answered action is left untouched. Unknown action_ids are
        ignored (logged, not raised — a stale/duplicate submit shouldn't 500).

        After calling this, re-trigger the same session_id: Engine's resume
        check calls agent.resume_check.hitl_action(state) to decide whether
        every action now has a response and, if so, proceeds into
        resume_check.resume_work(state) → the execution loop.
        """
        actions = await self._execution_manager.load_hitl_actions(session_id)
        by_id = {a.get("id"): a for a in actions}
        for r in responses:
            action = by_id.get(r.action_id)
            if action is None:
                logger.warning(
                    "Engine: submit_hitl_response — unknown action_id={} for session={}, ignored",
                    r.action_id,
                    session_id,
                )
                continue
            action["response"] = r.response
        await self._execution_manager.store_hitl_actions(session_id, actions)

    # ------------------------------------------------------------------
    # Webhook dispatch
    # ------------------------------------------------------------------

    async def _dispatch_webhooks(self, state: ExecutionState) -> None:
        """
        Fetch org webhook entries from DB and send notifications.
        Passes headers and signature config from stored entries.
        V1: best-effort. V2: retry via separate queue-based sender.
        """
        entries = await self._execution_manager.fetch_org_webhook_entries(
            org_id=state.org_id,
            session_id=state.session_id,
        )
        logger.debug(
            "Engine: dispatching webhooks | session={} count={}",
            state.session_id,
            len(entries),
        )
        for entry in entries:
            await self._execution_manager.send_webhook(
                thread_id=state.thread_id,
                session_id=state.session_id,
                status=state.status.value,
                url=entry["url"],
                headers=entry.get("headers") or {},
                signature_header=entry.get("signature_header"),
                signature_secret=entry.get("signature_secret"),
                signature_algorithm=entry.get("signature_algorithm"),
            )

    # ------------------------------------------------------------------
    # Dump queue — delegation for Runner's background worker
    # ------------------------------------------------------------------

    async def process_dump_queue(self, batch_size: int = 10) -> int:
        """
        Drain the async S3 dump queue. Called periodically by Runner's dump worker.
        Loads each run's checkpoint from Redis and uploads to S3 via asyncio.to_thread.
        Returns number of items processed.
        """
        return await self._execution_manager.process_dump_queue(batch_size=batch_size)

    # ------------------------------------------------------------------
    # DB schema setup (called at startup by Runner)
    # ------------------------------------------------------------------

    async def setup_db(self) -> None:
        """
        Create all DB tables and apply incremental schema migrations.
        Called once at startup by Runner.

        Two-phase:
          1. create_all  — creates any tables that don't yet exist (new deploys)
          2. run_migrations — applies ALTER TABLE statements for columns added
             after initial table creation (handles existing deploys)
        """
        from engine.db import Base, run_migrations

        async with self._db_engine.begin() as conn:
            # Phase 1: create missing tables
            await conn.run_sync(Base.metadata.create_all)
            # Phase 2: apply incremental column/index migrations
            await run_migrations(conn)

        logger.info("Engine: DB tables created/verified + migrations applied")
