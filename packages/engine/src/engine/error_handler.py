"""
engine.error_handler
~~~~~~~~~~~~~~~~~~~~
ErrorHandler — alerts platform and developer on major errors.

Triggered by Engine ONLY. NOT triggered by AgentCaller or UsageTracker.

V1: structured loguru logging at ERROR level (platform + developer alerts).
V2+: pluggable backends (webhook, Slack, PagerDuty, email).

The deployed Runner configures loguru sinks — errors logged here will
automatically flow to whatever sinks the runner has set up (log server, etc.).
"""
from __future__ import annotations

import traceback
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from pydantic import BaseModel, Field


class AlertContext(BaseModel):
    """Context passed to the error handler when an alert is triggered."""

    org_id: str
    run_id: str
    session_id: str
    agent_id: str = ""
    iteration: int = 0
    extras: dict[str, Any] = Field(default_factory=dict)


class ErrorHandler:
    """
    Triggers alerts on major errors during execution.

    Engine calls alert() when:
      - AgentCaller re-raises an exception (caught by Engine's loop)
      - Any other critical failure during the execution loop

    V1: structured loguru logging (platform-side alert = ERROR, developer = ERROR + traceback).
    V2: pluggable backends (webhook, Slack, PagerDuty, email).
    """

    def __init__(self) -> None:
        self._alert_backends: list[Any] = []  # V2: pluggable alert backends

    def alert(
        self,
        error: Exception,
        context: AlertContext,
    ) -> None:
        """
        Trigger platform + developer alerts for a major error.
        Called by Engine when an unrecoverable error occurs.
        """
        tb = traceback.format_exc()
        timestamp = datetime.now(timezone.utc).isoformat()

        # Platform alert — concise, structured (flows to log server via runner sink)
        logger.error(
            "ENGINE_ALERT | type={} | run={} | org={} | agent={} | iter={} | ts={} | msg={}",
            type(error).__name__,
            context.run_id,
            context.org_id,
            context.agent_id,
            context.iteration,
            timestamp,
            str(error),
        )

        # Developer alert — full traceback for debugging
        logger.error(
            "ENGINE_ALERT_DETAIL | run={} | traceback:\n{}",
            context.run_id,
            tb,
        )

        # V2: iterate pluggable alert backends
        for backend in self._alert_backends:
            try:
                backend.send({
                    "error_type": type(error).__name__,
                    "error_message": str(error),
                    "traceback": tb,
                    "org_id": context.org_id,
                    "run_id": context.run_id,
                    "session_id": context.session_id,
                    "agent_id": context.agent_id,
                    "iteration": context.iteration,
                    "timestamp": timestamp,
                    "extras": context.extras,
                })
            except Exception as backend_err:
                logger.warning("ErrorHandler: alert backend failed | backend={} err={}", type(backend).__name__, backend_err)
