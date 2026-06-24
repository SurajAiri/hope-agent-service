"""
engine.db
~~~~~~~~~
SQLAlchemy models and DB setup for the Engine.

Tables:
  - usage_records: UsageRecord persistence
  - run_metadata: Final run metadata on completion / dump
  - webhook_entries: Org-level webhook URLs (for dispatch on completion)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, Integer, String, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UsageRecordModel(Base):
    """
    Persistent record of every AgentCaller invocation.
    Matches the UsageRecord schema from arch Section 9.
    """

    __tablename__ = "usage_records"

    # Primary key
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Identity (Section 9: identity fields)
    step_id: Mapped[str] = mapped_column(String(64), default=lambda: str(uuid.uuid4()), index=True)
    org_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    proj_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    run_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(128), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    idem_key: Mapped[str] = mapped_column(String(256), nullable=True)

    # Caller extras (arbitrary metadata from CallerConfig.caller_extras)
    extras: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

    # Resource
    resource_type: Mapped[str] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(256), nullable=True)
    cost_fn_version: Mapped[str] = mapped_column(String(32), default="v1")

    # Usage
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    request_count: Mapped[int] = mapped_column(Integer, default=1)

    # Billing
    usage_raw: Mapped[dict] = mapped_column(JSON, default=dict)
    credit_cost: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status — 'success' | 'error'. Log flag only, NOT used for alerting.
    status: Mapped[str] = mapped_column(String(32), default="success")

    # Timestamp
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RunMetadataModel(Base):
    """
    Final metadata stored on DB after a run completes.
    Written by ExecutionManager.dump_data().
    """

    __tablename__ = "run_metadata"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    org_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    proj_id: Mapped[str] = mapped_column(String(128), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    idem_key: Mapped[str] = mapped_column(String(256), nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    iteration_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class WebhookEntryModel(Base):
    """
    Webhook config stored at run-start. Fetched by ExecutionManager.fetch_org_webhook_entries().
    Supports custom headers and HMAC signature verification on the receiving end.
    """

    __tablename__ = "webhook_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    org_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    run_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)

    # Extra request headers sent with every webhook POST (JSON object)
    headers: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

    # Optional HMAC signature config
    signature_header: Mapped[str | None] = mapped_column(String(256), nullable=True)
    signature_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_algorithm: Mapped[str | None] = mapped_column(String(32), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


# ---------------------------------------------------------------------------
# Schema migrations
# ---------------------------------------------------------------------------

# Each entry is a tuple of (description, SQL).
# SQL MUST be idempotent — use IF NOT EXISTS / IF EXISTS guards.
# Add a new tuple here whenever you add a column/index after initial deploy.
# Never remove old entries: other deployments may still need them.
_MIGRATIONS: list[tuple[str, str]] = [
    (
        "usage_records: add extras JSON column for developer-defined caller metadata",
        "ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS extras JSON",
    ),
    (
        "webhook_entries: add headers JSON column for custom request headers",
        "ALTER TABLE webhook_entries ADD COLUMN IF NOT EXISTS headers JSON",
    ),
    (
        "webhook_entries: add signature_header column for HMAC header name",
        "ALTER TABLE webhook_entries ADD COLUMN IF NOT EXISTS signature_header VARCHAR(256)",
    ),
    (
        "webhook_entries: add signature_secret column for HMAC secret",
        "ALTER TABLE webhook_entries ADD COLUMN IF NOT EXISTS signature_secret TEXT",
    ),
    (
        "webhook_entries: add signature_algorithm column (default sha256)",
        "ALTER TABLE webhook_entries ADD COLUMN IF NOT EXISTS signature_algorithm VARCHAR(32)",
    ),
    # Future migrations go here:
    # ("<description>", "<idempotent SQL>"),
]


async def run_migrations(conn) -> None:
    """
    Apply incremental schema changes to existing tables.

    ``create_all`` only creates tables that don't exist — it never alters
    existing ones. This function runs idempotent ALTER TABLE statements for
    every column / index added after initial deployment.

    Call once at startup, right after ``Base.metadata.create_all``.
    Safe to run on every restart: all SQL uses IF NOT EXISTS guards.

    Why keep extras?
    Developers pass arbitrary context through ``CallerConfig.caller_extras``
    (e.g. custom model params, business tags, A/B test labels).  Persisting it
    lets them slice usage reports by their own dimensions without needing a
    separate telemetry system.  Dropping it would silently swallow that data.
    """
    for description, sql in _MIGRATIONS:
        try:
            await conn.execute(text(sql))
            logger.debug("DB migration applied | {}", description)
        except Exception as exc:
            # Warn but never crash startup — a failed migration may just mean
            # the column already exists under a different type, or the DB user
            # lacks ALTER rights.  Logging lets the operator investigate.
            logger.warning(
                "DB migration skipped (may already be applied) | {} | err={}",
                description, exc,
            )
