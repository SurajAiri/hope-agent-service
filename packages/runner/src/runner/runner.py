"""
runner.runner
~~~~~~~~~~~~~
Runner — the core framework. Infrastructure bridge.

Responsibilities:
  1. SETUP (once at startup, called by deployed instance):
     - Creates infrastructure (redis, db, s3) via InfraFactory
     - Creates Engine(redis, db, s3) singleton
     - Sets up DB schema
     - Optionally creates runner-level AgentContext with shared tools

  2. TRIGGER RUN (per request, called by FastAPI route handler / worker):
     - Receives trigger params
     - Resolves Agent by agent_id (calls developer's factory function — fresh
       instance every call, including HITL resumes; see agent_sdk.agent.BaseAgent
       module docstring point 4 for why that means __aenter__/__aexit__ is
       scoped to one call, not a whole HITL-spanning session)
     - Creates Streamer (SSE for streaming, Null for non-streaming)
     - Injects _usage_tracker and _streamer into ALL AgentCaller instances
     - Calls engine.trigger_session(params, agent) inside `async with agent:`

Runner is the ONLY place where infrastructure meets agent logic.
Agent factory functions return Agent objects — not raw tuples.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from agent_sdk import ToolCaller
from agent_sdk.agent import Agent
from agent_sdk.agent_context import AgentContext
from agent_sdk.caller import AgentCaller
from engine.engine import Engine
from engine.types import ExecutionState, TriggerParams
from loguru import logger

from runner.infra import InfraConfig, InfraFactory
from runner.streamer import NullStreamer, SSEStreamer, Streamer

# Agent factory type: given agent_id, returns an Agent object.
# Developer implements this — it's their factory function.
AgentFactory = Callable[[str], Agent]


class Runner:
    """
    The Runner framework. One instance per deployed process.

    Usage:
        # In FastAPI lifespan (startup):
        runner = Runner(config=InfraConfig.from_env())
        await runner.setup()
        runner.register_agent("my-agent", my_agent_factory)

        # In route handler (per request):
        state, streamer = await runner.trigger_session(params)
        if params.stream:
            return EventSourceResponse(streamer.stream())
        else:
            return {"result": state.result}
    """

    def __init__(self, config: InfraConfig | None = None) -> None:
        self._config = config or InfraConfig.from_env()
        self._engine: Engine | None = None
        self._agent_factories: dict[str, AgentFactory] = {}

        # Runner-level shared AgentContext (shared tools available to all agents)
        self._runner_agent_context: AgentContext | None = None

        # Background worker task for draining the async S3 dump queue
        self._dump_worker_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Setup — called once at startup
    # ------------------------------------------------------------------

    async def setup(self) -> None:
        """
        Initialize infrastructure and Engine. Call once at startup.
        Creates: redis, db engine, s3 client → Engine singleton → DB schema.
        """
        logger.info("Runner: setup starting...")

        # 1. Create infrastructure clients
        redis = InfraFactory.create_redis(self._config.redis)
        db_engine = InfraFactory.create_db_engine(self._config.database)
        s3_client = InfraFactory.create_s3_client(self._config.s3)
        InfraFactory.ensure_s3_bucket(s3_client, self._config.s3.bucket)

        # 2. Create Engine singleton (receives injected infrastructure)
        self._engine = Engine(
            redis=redis,
            db_engine=db_engine,
            s3_client=s3_client,
            s3_bucket=self._config.s3.bucket,
        )

        # 3. Set up DB schema (creates tables if not exist)
        await self._engine.setup_db()

        # 4. Create runner-level AgentContext with empty shared ToolCaller
        # (add shared platform tools here — available to all agents via CM parent chain)
        shared_tool_caller = ToolCaller(tools=[])
        self._runner_agent_context = AgentContext(
            tool_caller=shared_tool_caller,
            parent=None,
        )

        # 5. Start background S3 dump queue worker
        self._dump_worker_task = asyncio.create_task(
            self._run_dump_worker(), name="runner-dump-worker"
        )

        logger.info("Runner: setup complete")

    async def teardown(self) -> None:
        """Cleanup resources on shutdown."""
        logger.info("Runner: teardown")

        # Stop the dump worker gracefully before closing Redis
        if self._dump_worker_task is not None and not self._dump_worker_task.done():
            self._dump_worker_task.cancel()
            try:
                await self._dump_worker_task
            except asyncio.CancelledError:
                pass
            logger.debug("Runner: dump worker stopped")

        if self._engine and hasattr(self._engine, "_redis"):
            await self._engine._redis.aclose()
            logger.debug("Runner: Redis connection closed")

    # ------------------------------------------------------------------
    # Agent registration
    # ------------------------------------------------------------------

    def register_agent(self, agent_id: str, factory: AgentFactory) -> None:
        """
        Register an agent factory function.

        Factory signature: (agent_id: str) -> Agent
        The factory is called fresh on every trigger_session() call.
        Components in Agent should be lightweight (stateless is ideal).
        """
        self._agent_factories[agent_id] = factory
        logger.info("Runner: agent '{}' registered", agent_id)

    def list_agents(self) -> list[str]:
        """
        Return the IDs of all registered agents.

        Example::

            @app.get("/agents")
            def get_agents():
                return runner.list_agents()
        """
        return list(self._agent_factories.keys())

    def get_agent(self, agent_id: str) -> Agent:
        """
        Instantiate and return the Agent for the given agent_id.
        Raises KeyError with a helpful message if not registered.

        Useful for introspection, health-checks, and testing without
        triggering a full run.

        Example::

            @app.get("/agents/{agent_id}")
            def agent_info(agent_id: str):
                agent = runner.get_agent(agent_id)
                return {"agent_id": agent.agent_id, "metadata": agent.metadata}
        """
        return self._resolve_agent(agent_id)

    def wire_agent(
        self,
        agent_id: str,
        *,
        stream: bool = False,
    ) -> Agent:
        """
        Instantiate, wire (inject dependencies), and return the Agent.
        Does NOT trigger a run. Useful for testing ExecutionStep logic.

        Args:
            agent_id: Registered agent ID.
            stream:   If True, injects an SSEStreamer. Otherwise NullStreamer.

        Example::

            # In a test:
            agent = runner.wire_agent("my-agent")
            result = await agent.execution_step.run(
                agent.runner, agent.agent_context, make_step_context()
            )
        """
        if self._engine is None:
            raise RuntimeError("Call await runner.setup() before wire_agent().")
        agent = self._resolve_agent(agent_id)
        streamer = SSEStreamer() if stream else NullStreamer()
        self._inject_dependencies(agent, streamer)
        return agent

    def register_tools(self, *tools: Any) -> None:
        """
        Register shared platform tools on the runner-level AgentContext.
        These tools are available to ALL agents via parent-chain resolution.

        Call after setup() completes.

        Example::

            await runner.setup()
            runner.register_tools(AuditLogTool(), RateLimiterTool())
        """
        if self._runner_agent_context is None:
            raise RuntimeError("Call await runner.setup() before register_tools().")
        for tool in tools:
            self._runner_agent_context.tool_caller.register(tool)
            logger.info("Runner: shared tool '{}' registered", tool.name)

    # ------------------------------------------------------------------
    # Trigger run — called per request
    # ------------------------------------------------------------------

    async def trigger_session(
        self, params: TriggerParams
    ) -> tuple[ExecutionState, Streamer]:
        """
        Trigger an agent run.

        Flow:
          1. Resolve Agent via registered factory (calls developer's factory)
          2. Link agent AgentContext to runner-level shared AgentContext
          3. Create Streamer (SSE or Null depending on params.stream)
          4. Inject _usage_tracker + _streamer into all AgentCaller instances
          5. Call engine.trigger_session(params, agent)
          6. Close streamer (signals SSE generator to finish)
          7. Return (ExecutionState, Streamer)

        Args:
            params: TriggerParams from the deployed runner (route handler)

        Returns:
            (ExecutionState, Streamer)
            - streamer.stream() for SSE responses
            - state.result for non-streaming responses
        """
        if self._engine is None:
            raise RuntimeError(
                "Runner.setup() has not been called yet. Call `await runner.setup()` first."
            )

        logger.info(
            "Runner: trigger_session | agent={} org={} session={} stream={}",
            params.agent_id,
            params.org_id,
            params.session_id,
            params.stream,
        )

        # 1. Resolve Agent via factory
        agent = self._resolve_agent(params.agent_id)

        # 2. Link agent CM parent to runner-level shared CM (layered tool resolution)
        if (
            self._runner_agent_context is not None
            and agent.agent_context.parent is None
        ):
            agent.agent_context.parent = self._runner_agent_context

        # 3. Create streamer
        streamer: Streamer = SSEStreamer() if params.stream else NullStreamer()

        # 4. Inject usage_tracker + streamer into ALL AgentCaller instances
        self._inject_dependencies(agent, streamer)

        # 5. Run — `async with agent` scopes BaseAgent.__aenter__/__aexit__ to
        # exactly this one trigger_session() call (see agent_sdk.agent.BaseAgent
        # module docstring, point 4). This is NOT the same as a HITL-spanning
        # lifecycle: a HITL resume days later calls _resolve_agent() again and
        # gets a brand-new Agent instance from the factory, which re-enters
        # __aenter__ fresh. Default no-op unless a runner overrides it to open/
        # close a per-run resource (http client, db connection, etc.).
        try:
            async with agent:
                state = await self._engine.trigger_session(params=params, agent=agent)
        finally:
            # 6. Close streamer — signals SSE generator's DONE sentinel
            streamer.close()

        logger.info(
            "Runner: trigger_session done | agent={} session={} status={}",
            params.agent_id,
            state.session_id,
            state.status.value,
        )
        return state, streamer

    # ------------------------------------------------------------------
    # Dependency injection — Runner's most important job
    # ------------------------------------------------------------------

    def _inject_dependencies(self, agent: Agent, streamer: Streamer) -> None:
        """
        Inject _usage_tracker and _streamer into ALL AgentCaller instances.

        From arch: "runner injects to all AgentCaller instances:
            foo._usage_tracker = engine.usage_tracker
            foo._streamer      = streamer
        Every child of AgentCaller (i.e AgentRunner, ToolCaller, etc.)
        gets injected UsageTracker & Streamer."

        This includes: agent.runner + all ToolCallers in the AgentContext chain.
        """
        usage_tracker = self._engine.usage_tracker
        callers: list[AgentCaller] = [agent.runner]

        # Walk AgentContext parent chain, collect all ToolCallers
        cm: AgentContext | None = agent.agent_context
        while cm is not None:
            callers.append(cm.tool_caller)
            cm = cm.parent

        for caller in callers:
            caller._usage_tracker = usage_tracker
            caller._streamer = streamer
            logger.debug("Runner: injected into {}", type(caller).__name__)

    # ------------------------------------------------------------------
    # Agent resolution
    # ------------------------------------------------------------------

    def _resolve_agent(self, agent_id: str) -> Agent:
        """
        Look up registered agent factory by agent_id and call it.
        Raises KeyError with helpful message if agent_id is not registered.
        """
        factory = self._agent_factories.get(agent_id)
        if factory is None:
            available = list(self._agent_factories.keys())
            logger.error(
                "Runner: unknown agent_id='{}' | registered={}",
                agent_id,
                available,
            )
            raise KeyError(
                f"Agent '{agent_id}' is not registered. Available: {available}"
            )
        return factory(agent_id)

    # ------------------------------------------------------------------
    # Background dump worker
    # ------------------------------------------------------------------

    async def _run_dump_worker(self) -> None:
        """
        Continuously drain the async S3 dump queue.

        After every engine run (or HITL pause) the session_id is pushed onto a Redis
        list. This worker pops items from that list and uploads the Redis
        checkpoint to S3 via asyncio.to_thread — keeping S3 I/O off the hot path.

        Polls every 5 seconds; processes up to 10 items per cycle.
        Exits cleanly when cancelled (e.g. during Runner.teardown).
        """
        logger.info("Runner: S3 dump worker started")
        while True:
            try:
                if self._engine is not None:
                    count = await self._engine.process_dump_queue(batch_size=10)
                    if count > 0:
                        logger.debug(
                            "Runner: dump worker processed {} item(s)", count
                        )
            except asyncio.CancelledError:
                logger.info("Runner: dump worker shutting down")
                raise
            except Exception as e:
                # Log but never crash the worker — next cycle will retry the queue.
                logger.error("Runner: dump worker unexpected error: {}", e)
            await asyncio.sleep(5)
