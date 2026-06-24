"""
gen_ai.main
~~~~~~~~~~~~~~~~~
FastAPI deployed runner instance.

This is the outermost shell — the "Deployed Runner Instance" from the architecture.
It wires infrastructure to the Runner Framework and exposes HTTP routes.

Loguru configuration:
  - Console sink: always active (INFO level in production, DEBUG in dev mode)
  - File sink: rotating log file (DEBUG level — full detail)
  - Remote sink: pluggable — uncomment/configure to forward logs to a log server
    All packages (agent-sdk, engine, runner) use the same loguru global logger,
    so any sinks added here receive logs from the entire stack.

Routes:
  POST /run               → fire-and-forget trigger (returns run_id immediately)
  POST /run/sync          → blocking trigger (waits for completion, returns full result)
  POST /run/stream        → trigger streaming run (SSE)
  GET  /run/status/{id}   → poll run status from Redis
  GET  /run/{id}          → get completed run result + state
  GET  /health            → health check
  GET  /                  → endpoint index
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from agent_sdk.messages import parse_message
from engine.types import TriggerParams, WebhookConfig
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel, Field
from runner.infra import DatabaseConfig, InfraConfig, RedisConfig, S3Config
from runner.runner import Runner
from runner.streamer import SSEStreamer
from sse_starlette.sse import EventSourceResponse

from genai.agents import echo_agent_factory
from genai.config import settings

# ---------------------------------------------------------------------------
# Loguru configuration — configure once at startup, all packages inherit
# ---------------------------------------------------------------------------


def configure_logging() -> None:
    """
    Configure loguru sinks.

    All packages (agent-sdk, engine, runner, fastapi-demo) use loguru's global logger.
    Sinks added here receive logs from the ENTIRE stack.

    Patterns:
      - Console: human-readable, colored, INFO+ in prod / DEBUG in dev
      - File:    rotating JSON-style, DEBUG+ for full observability
      - Remote:  async HTTP sink — send to your log server (Loki, Logstash, etc.)
                 Uncomment and configure _remote_log_sink to enable.
    """
    # Remove default loguru handler (we configure our own)
    logger.remove()

    # ── Console sink ────────────────────────────────────────────────────────
    log_level = "DEBUG" if settings.debug else settings.log_level.upper()
    logger.add(
        sys.stderr,
        level=log_level,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan> | "
            "<level>{message}</level>"
        ),
        colorize=True,
        enqueue=True,  # thread-safe
    )

    # ── File sink (rotating) ─────────────────────────────────────────────────
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    logger.add(
        log_dir / "agent_service_{time:YYYY-MM-DD}.log",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name} | {message}",
        rotation="50 MB",
        retention="14 days",
        compression="gz",
        enqueue=True,
        serialize=False,  # set True for JSON logs (easier to parse in log servers)
    )

    # ── Remote sink (log server) ─────────────────────────────────────────────
    # Uncomment and configure for log server forwarding (Loki, Logstash, etc.)
    # The deployed runner is the only place that needs to configure this.
    # All packages will automatically forward their logs through this sink.
    #
    # async def _remote_log_sink(message: loguru.Message) -> None:
    #     """Async sink — forwards logs to a remote log server."""
    #     import httpx
    #     record = message.record
    #     payload = {
    #         "timestamp": record["time"].isoformat(),
    #         "level": record["level"].name,
    #         "message": record["message"],
    #         "name": record["name"],
    #         "extra": record["extra"],
    #     }
    #     try:
    #         async with httpx.AsyncClient() as client:
    #             await client.post("https://your-log-server/ingest", json=payload, timeout=3)
    #     except Exception:
    #         pass  # never fail on logging
    #
    # logger.add(_remote_log_sink, level="INFO", enqueue=True)

    logger.info("Logging configured | level={} debug={}", log_level, settings.debug)


configure_logging()

# ---------------------------------------------------------------------------
# Runner (module-level singleton — initialized in lifespan)
# ---------------------------------------------------------------------------

runner: Runner | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: setup on startup, teardown on shutdown."""
    global runner

    logger.info("Starting up: {}", settings.app_name)

    infra_config = InfraConfig(
        redis=RedisConfig(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password,
        ),
        database=DatabaseConfig(
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            echo=settings.db_echo,
        ),
        s3=S3Config(
            endpoint_url=settings.s3_endpoint_url,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            region=settings.s3_region,
            bucket=settings.s3_bucket,
        ),
    )

    runner = Runner(config=infra_config)
    await runner.setup()

    # Register agents — developer adds their agents here
    from genai.agents import (
        react_agent_factory,
        simple_agent_factory,
    )

    runner.register_agent("echo", echo_agent_factory)
    runner.register_agent("simple", simple_agent_factory)
    runner.register_agent("react", react_agent_factory)

    logger.info("{} ready | agents={}", settings.app_name, runner.list_agents())
    yield

    logger.info("Shutting down...")
    if runner:
        await runner.teardown()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    description="AI Agent-as-a-Service — FastAPI Runner Demo",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global error handlers — keep user-side errors as 4xx, never 500
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Pydantic body validation errors (missing fields, wrong types, etc.) → 422.
    Returns structured field-level error details instead of a raw 500.
    """
    logger.warning(
        "Validation error | path={} errors={}", request.url.path, exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """
    ValueError from application logic (e.g. unknown message role from parse_message)
    should be a 400 Bad Request, not a 500 Internal Server Error.
    """
    logger.warning("Bad request | path={} err={}", request.url.path, exc)
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class Message(BaseModel):
    role: str = Field(..., description="'user', 'assistant', or 'tool'")
    content: str = Field(..., description="Message content")


class RunRequest(BaseModel):
    agent_id: str = Field(default="echo", description="Registered agent ID")
    messages: list[Message] = Field(..., description="Conversation messages")
    org_id: str = Field(default="demo-org")
    proj_id: str = Field(default="demo-proj")
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    webhook: bool = Field(
        default=True, description="Whether to dispatch webhooks for this run"
    )
    # Pass a WebhookConfig to receive an async POST notification when the run completes.
    # If omitted (or None), no webhook is sent.
    webhook_config: WebhookConfig | None = Field(default=None)
    extras: dict[str, Any] = Field(default_factory=dict)


class TriggerResponse(BaseModel):
    """Returned immediately by POST /run (fire-and-forget)."""

    run_id: str
    session_id: str
    status: str  # always "queue" on initial response


class RunResponse(BaseModel):
    run_id: str
    session_id: str
    status: str
    result: Any = None
    error: str | None = None
    iteration_count: int = 0


class StatusResponse(BaseModel):
    run_id: str
    status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_runner() -> Runner:
    if runner is None:
        raise HTTPException(status_code=503, detail="Runner not initialized")
    return runner


def _build_params(req: RunRequest, stream: bool) -> TriggerParams:
    try:
        messages = [parse_message(m.model_dump()) for m in req.messages]
    except ValueError as exc:
        # Unknown role or malformed message — surface as 400, not 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TriggerParams(
        idem_key=str(uuid.uuid4()),
        run_id=str(uuid.uuid4()),  # pre-generated so caller can return it immediately
        agent_id=req.agent_id,
        org_id=req.org_id,
        proj_id=req.proj_id,
        session_id=req.session_id,
        messages=messages,
        stream=stream,
        webhook=req.webhook,
        webhook_config=req.webhook_config,
        extras=req.extras,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", tags=["Meta"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": settings.app_name}


@app.get("/agents", tags=["Meta"])
async def list_agents():
    """List all registered agent IDs."""
    r = _get_runner()
    return {"agents": r.list_agents()}


@app.post("/run", response_model=TriggerResponse, tags=["Agent Run"])
async def trigger_run(req: RunRequest):
    """
    Fire-and-forget agent run.

    Returns immediately with a run_id. The engine executes in the background.
    Poll for progress:
      GET /run/status/{run_id}  → {status: "wip" | "done" | "fail" | ...}
      GET /run/{run_id}         → full result once status is "done"

    Use POST /run/sync if you want to block until completion.
    """
    r = _get_runner()
    params = _build_params(req, stream=False)

    logger.info(
        "POST /run (async) | agent={} session={}", req.agent_id, params.session_id
    )

    async def _run_background() -> None:
        try:
            await r.trigger_run(params)
        except Exception as exc:
            logger.error(
                "Background run failed | agent={} run={} err={}",
                req.agent_id,
                params.idem_key,
                exc,
            )

    asyncio.create_task(_run_background())

    return TriggerResponse(
        run_id=params.run_id,
        session_id=params.session_id,
        status="queue",
    )


@app.post("/run/sync", response_model=RunResponse, tags=["Agent Run"])
async def trigger_run_sync(req: RunRequest):
    """
    Blocking agent run — waits for completion before responding.

    Suitable for short-lived agents (echo, simple demos).
    For long-running agents prefer POST /run (fire-and-forget) + polling.
    """
    r = _get_runner()
    params = _build_params(req, stream=False)

    logger.info("POST /run/sync | agent={} session={}", req.agent_id, params.session_id)

    state, _ = await r.trigger_run(params)
    return RunResponse(
        run_id=state.run_id,
        session_id=state.session_id,
        status=state.status.value,
        result=state.result,
        error=state.error,
        iteration_count=state.iteration,
    )


@app.post("/run/stream", tags=["Agent Run"])
async def trigger_run_stream(req: RunRequest, request: Request):
    """
    Trigger a streaming agent run.
    Returns Server-Sent Events (SSE).

    SSE event format:
      event: message
      data: {"content": "...", "is_final": false}

      event: done
      data: {"done": true}

    Client usage (JavaScript):
      const es = new EventSource('/run/stream');
      es.onmessage = e => console.log(JSON.parse(e.data).content);
      es.addEventListener('done', () => es.close());
    """
    r = _get_runner()
    params = _build_params(req, stream=True)

    logger.info(
        "POST /run/stream | agent={} session={}", req.agent_id, params.session_id
    )

    # Build the streamer up front so we can return EventSourceResponse immediately.
    # The execution runs as a background task; chunks are pushed via the queue.
    streamer = SSEStreamer()

    # wire_agent() resolves + injects dependencies — using our pre-built streamer.
    # This avoids touching private runner internals.
    agent = r.wire_agent(
        params.agent_id, stream=False
    )  # stream=False: we control the streamer
    # Manually swap in our SSEStreamer (wire_agent injects NullStreamer by default)
    from agent_sdk.caller import AgentCaller
    from agent_sdk.agent_context import AgentContext as _AgentContext

    callers: list[AgentCaller] = [agent.runner]
    _cm: _AgentContext | None = agent.agent_context
    while _cm is not None:
        callers.append(_cm.tool_caller)
        _cm = _cm.parent
    for _caller in callers:
        _caller._streamer = streamer
    # Link agent context parent to runner-level shared context
    if r._runner_agent_context is not None and agent.agent_context.parent is None:
        agent.agent_context.parent = r._runner_agent_context

    async def _run_in_background() -> None:
        """Runs the engine in background — pushes chunks to streamer via queue."""
        try:
            if r._engine is None:
                raise RuntimeError("Engine not initialized")
            await r._engine.trigger_run(params=params, agent=agent)
        except Exception as exc:
            logger.error(
                "SSE background run failed | agent={} err={}", req.agent_id, exc
            )
        finally:
            streamer.close()

    asyncio.create_task(_run_in_background())

    async def _event_generator():
        async for event in streamer.stream():
            if await request.is_disconnected():
                logger.info("SSE: client disconnected | session={}", params.session_id)
                break
            yield event

    return EventSourceResponse(_event_generator())


@app.get("/run/status/{run_id}", response_model=StatusResponse, tags=["Agent Run"])
async def get_run_status(run_id: str):
    """Poll the status of a run (Redis-backed)."""
    r = _get_runner()
    if r._engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    status = await r._engine._execution_manager.get_status(run_id)
    return StatusResponse(run_id=run_id, status=status.value)


@app.get("/run/{run_id}", tags=["Agent Run"])
async def get_run_result(run_id: str):
    """
    Get completed run result and metadata.
    Restores state from Redis checkpoint.
    Returns 404 if run_id not found.
    """
    r = _get_runner()
    if r._engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    state = await r._engine._execution_manager.checkpoint_restore(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    return JSONResponse(
        {
            "run_id": state.run_id,
            "session_id": state.session_id,
            "status": state.status.value,
            "result": state.result,
            "error": state.error,
            "iteration_count": state.iteration,
            "agent_id": state.agent_id,
        }
    )


@app.get("/", tags=["Meta"])
async def root():
    return {
        "service": settings.app_name,
        "version": "0.1.0",
        "endpoints": {
            "POST /run": "Fire-and-forget trigger — returns run_id immediately, runs in background",
            "POST /run/sync": "Blocking trigger — waits for completion, returns full result",
            "POST /run/stream": "Streaming trigger — SSE, token-by-token output",
            "GET /run/status/{run_id}": "Poll run status (queue | wip | done | fail)",
            "GET /run/{run_id}": "Get completed run result",
            "GET /health": "Health check",
            "GET /docs": "Interactive API docs",
        },
    }
