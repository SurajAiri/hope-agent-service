"""
agent_sdk.caller
~~~~~~~~~~~~~~~~
AgentCaller — the abstract base for every caller (AgentRunner, ToolCaller, etc.).

Key design rules (non-negotiable, from arch):
  1. Only ONE public method: invoke(). Children NEVER override it.
  2. Children implement _do_invoke() and optionally _do_stream().
  3. _usage_tracker and _streamer are injected by Runner at trigger time.
  4. On any failure: log usage (cost=None, status='error'), re-raise.
     Engine's ErrorHandler triggers alerts — NOT the AgentCaller.

Type parameter TConfig (Generic[TConfig]):
  - Bound to CallerConfig so every concrete config carries resource identity.
  - AgentCaller[LlmConfig], AgentCaller[ToolCallConfig], etc. for full static typing.
  - Uses typing.Generic for Python 3.10+ compatibility.
"""
from __future__ import annotations

import abc
from typing import Any, AsyncIterator, Generic, TypeVar

from loguru import logger

from agent_sdk.caller_config import CallerConfig
from agent_sdk.types import (
    AgentResponse,
    CostResult,
    StreamChunk,
    StreamerProtocol,
    Usage,
    UsageTrackerProtocol,
)

# TypeVar bound to CallerConfig — concrete callers specialise this.
TConfig = TypeVar("TConfig", bound=CallerConfig)


def _merge_usage(a: Usage | None, b: Usage | None) -> Usage | None:
    if a is None:
        return b
    if b is None:
        return a
    return a + b


class AgentCaller(Generic[TConfig], abc.ABC):
    """
    Abstract base for all callers in the Agent SDK.

    Generic[TConfig] gives concrete subclasses (AgentRunner[LlmConfig],
    ToolCaller[ToolCallConfig], …) full static type safety on config.

    _usage_tracker and _streamer are class-level None defaults.
    Runner injects real instances before trigger_run is called:
        caller._usage_tracker = engine.usage_tracker
        caller._streamer      = streamer
    """

    _usage_tracker: UsageTrackerProtocol | None = None
    _streamer: StreamerProtocol | None = None

    # ------------------------------------------------------------------
    # Single public entry point — NEVER override this in subclasses.
    # ------------------------------------------------------------------

    async def invoke(self, config: TConfig, stream: bool = False, **kwargs: Any) -> AgentResponse:
        """
        Single public async invoke method. Routes to streaming or non-streaming path.
        Engine / Agent SDK calls this. Never called directly by application code.
        """
        if stream:
            return await self._handle_stream(config, **kwargs)
        return await self._handle_invoke(config, **kwargs)

    # ------------------------------------------------------------------
    # Internal dispatch — not for subclasses to call
    # ------------------------------------------------------------------

    async def _handle_invoke(self, config: TConfig, **kwargs: Any) -> AgentResponse:
        caller_name = type(self).__name__
        logger.debug("{}: invoke start", caller_name)
        try:
            response = await self._do_invoke(config, **kwargs)
            cost = self._calc_cost(config, response.usage)
            if self._usage_tracker is not None:
                self._usage_tracker.log(config, response.usage, cost, status="success")
            logger.debug(
                "{}: invoke success | tokens={}/{}",
                caller_name,
                response.usage.prompt_tokens if response.usage else 0,
                response.usage.completion_tokens if response.usage else 0,
            )
            return response
        except Exception as exc:
            logger.error("{}: invoke failed — {} {}", caller_name, type(exc).__name__, exc)
            if self._usage_tracker is not None:
                self._usage_tracker.log(config, usage=None, cost=None, status="error")
            # UsageTracker only logs. Engine catches this and triggers alerts.
            raise

    async def _handle_stream(self, config: TConfig, **kwargs: Any) -> AgentResponse:
        caller_name = type(self).__name__
        accumulated_usage: Usage | None = None
        final_chunk: StreamChunk | None = None
        # Accumulate every content_delta so the caller receives the full string,
        # not just the last chunk (which is the only delta for that chunk, not all).
        content_parts: list[str] = []
        chunk_count = 0
        logger.debug("{}: stream start", caller_name)
        try:
            async for chunk in self._do_stream(config, **kwargs):
                if self._streamer is not None:
                    await self._streamer.push(chunk)
                if chunk.content_delta:
                    content_parts.append(chunk.content_delta)
                if chunk.usage_delta is not None:
                    accumulated_usage = _merge_usage(accumulated_usage, chunk.usage_delta)
                final_chunk = chunk
                chunk_count += 1

            cost = self._calc_cost(config, accumulated_usage)
            if self._usage_tracker is not None:
                self._usage_tracker.log(
                    config, accumulated_usage, cost, status="success"
                )
            logger.debug(
                "{}: stream complete | chunks={} tokens={}/{}",
                caller_name,
                chunk_count,
                accumulated_usage.prompt_tokens if accumulated_usage else 0,
                accumulated_usage.completion_tokens if accumulated_usage else 0,
            )
            # Return the full accumulated content, not just the last delta.
            # This ensures ExecutionStep receives the complete response string
            # regardless of how many chunks the LLM emitted.
            full_content = "".join(content_parts)
            return AgentResponse(
                content=full_content,
                usage=accumulated_usage,
                metadata=final_chunk.metadata if final_chunk else {},
            )
        except Exception as exc:
            logger.error("{}: stream failed after {} chunks — {} {}", caller_name, chunk_count, type(exc).__name__, exc)
            if self._usage_tracker is not None:
                # Log what was accumulated before crash — no charge (cost=None)
                self._usage_tracker.log(
                    config, accumulated_usage, cost=None, status="error"
                )
            raise

    # ------------------------------------------------------------------
    # Hooks subclasses implement
    # ------------------------------------------------------------------

    @abc.abstractmethod
    async def _do_invoke(self, config: TConfig, **kwargs: Any) -> AgentResponse:
        """
        Concrete async invoke implementation. Must be implemented by all subclasses.
        Tool callers only need this. LLM callers override both this and _do_stream.
        """
        ...

    async def _do_stream(self, config: TConfig, **kwargs: Any) -> AsyncIterator[StreamChunk]:
        """
        Default streaming: yields the invoke result as a single final chunk.
        LLM callers that support true streaming should override this.
        Tool callers do NOT need to override this.
        """
        response = await self._do_invoke(config, **kwargs)
        yield StreamChunk(
            content_delta=str(response.content) if response.content is not None else "",
            usage_delta=response.usage,
            is_final=True,
            metadata=response.metadata,
        )

    # ------------------------------------------------------------------
    # Cost calculation — override for custom pricing
    # ------------------------------------------------------------------

    def _calc_cost(self, config: TConfig, usage: Usage | None) -> CostResult | None:
        """
        Default cost calculator.
        Developers are encouraged to override this with their cost_fn.
        Default: returns None (no cost) — a safe no-op.
        """
        return None
