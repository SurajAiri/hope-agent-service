"""
runner.streamer
~~~~~~~~~~~~~~~
Streamer — the infrastructure-side streaming abstraction.

The Streamer ABC implements StreamerProtocol from agent_sdk.
Agent SDK only sees the protocol. The concrete implementation lives here in Runner.

SSEStreamer: Server-Sent Events implementation for FastAPI.
  - Smart lifecycle: does NOT hold connection blindly.
  - Opens/closes per .stream(...) call.
  - push() enqueues chunks via asyncio.Queue.put_nowait() — async-safe since
    AgentCaller._handle_stream() is now fully async (runs in the event loop).
  - stream() is an async generator that yields SSE-formatted events.
  - DONE sentinel closes the stream cleanly.
"""
from __future__ import annotations

import abc
import asyncio
import json
from typing import AsyncIterator

from agent_sdk.types import StreamChunk
from loguru import logger

_STREAM_DONE = object()  # Sentinel to signal stream completion


class Streamer(abc.ABC):
    """
    Abstract base for all streamers. Implements StreamerProtocol from agent_sdk.

    Smart lifecycle:
      - Does NOT hold a connection blindly.
      - Opens/closes connection per .stream(...) call.
      - push() is called by AgentCaller._handle_stream() (which is now async).
    """

    @abc.abstractmethod
    async def push(self, chunk: StreamChunk) -> None:
        """
        Push a chunk to the stream. Called by AgentCaller._handle_stream().
        Async since _handle_stream() now runs fully in the event loop.
        """
        ...

    def close(self) -> None:
        """Signal that streaming is complete. Called by Runner after invoke() returns."""
        pass


class SSEStreamer(Streamer):
    """
    Server-Sent Events streamer for FastAPI.

    Usage:
        streamer = SSEStreamer()
        # Inject into AgentCaller: caller._streamer = streamer

        # In FastAPI route:
        async def sse_route():
            return EventSourceResponse(streamer.stream())

        # After trigger_run completes:
        streamer.close()  # signals the stream generator to finish

    The stream() generator yields SSE events as strings formatted for sse-starlette.
    push() is now async and uses queue.put_nowait() directly — safe since we're
    guaranteed to be in the running event loop.
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()
        self._closed = False

    async def push(self, chunk: StreamChunk) -> None:
        """
        Enqueue a chunk. Called from the async context of AgentCaller._handle_stream().
        Uses put_nowait() — we're already in the event loop, no thread bridging needed.
        """
        if self._closed:
            return
        self._queue.put_nowait(chunk)

    def close(self) -> None:
        """Signal stream completion. Safe to call from any context."""
        if self._closed:
            return
        self._closed = True
        try:
            self._queue.put_nowait(_STREAM_DONE)
        except Exception:
            pass

    async def stream(self) -> AsyncIterator[dict]:
        """
        Async generator that yields SSE events.
        Each yielded dict is consumed by sse-starlette's EventSourceResponse.

        Format: {"event": "message", "data": "<json>"}
        Final event: {"event": "done", "data": "{}"}
        """
        while True:
            item = await self._queue.get()
            if item is _STREAM_DONE:
                yield {"event": "done", "data": json.dumps({"done": True})}
                break
            chunk: StreamChunk = item
            payload = {
                "content": chunk.content_delta,
                "is_final": chunk.is_final,
                "metadata": chunk.metadata,
            }
            yield {"event": "message", "data": json.dumps(payload)}


class NullStreamer(Streamer):
    """
    No-op streamer for non-streaming runs.
    push() discards all chunks (streaming isn't needed in non-stream mode).
    """

    async def push(self, chunk: StreamChunk) -> None:
        pass  # Intentional no-op

    def close(self) -> None:
        pass
