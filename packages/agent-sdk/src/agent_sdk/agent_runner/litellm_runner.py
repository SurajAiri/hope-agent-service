"""
agent_sdk.litellm_runner
~~~~~~~~~~~~~~~~~~~~~~~~
LitellmAgentRunner — AgentRunner[LlmConfig] backed by LiteLLM.

LiteLLM unifies 100+ LLM providers (OpenAI, Anthropic, Gemini, Bedrock, Azure, etc.)
behind a single interface. This runner lets developers use any provider by just
changing the model string in AgentProfile.

Requires: `pip install litellm` (optional dep — lazy import so agent-sdk stays lightweight)

Usage::

    from agent_sdk import LitellmAgentRunner, AgentProfile, LlmConfig

    profile = AgentProfile(
        agent_id="my-agent",
        default_llm=LlmConfig(model="gpt-4o", provider="openai"),
        fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
    )

    # Use directly (no subclassing needed for standard LLM calls):
    runner = LitellmAgentRunner(agent_config=profile)

    # Or subclass for custom prompt building / output parsing:
    class MyRunner(LitellmAgentRunner):
        async def _do_invoke(self, config: LlmConfig, messages, **kwargs):
            # pre-process messages, then call super
            return await super()._do_invoke(config, messages, **kwargs)

    # In ExecutionStep — pass agent_runner.default_config (already resolved LlmConfig):
    response = await agent_runner.invoke(
        config=agent_runner.default_config,   # LlmConfig, not AgentProfile
        messages=context.messages,
        stream=context.stream,
    )

    # Or use a specific preset for this call:
    response = await agent_runner.invoke(
        config=agent_runner.agent_profile.get_config("fast"),
        messages=context.messages,
    )
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from loguru import logger

from agent_sdk.agent_profile import AgentProfile, LlmConfig
from agent_sdk.agent_runner import AgentRunner
from agent_sdk.messages import AnyMessage
from agent_sdk.types import AgentResponse, CostResult, StreamChunk, ToolCall, Usage


def _require_litellm() -> Any:
    """Lazy import of litellm with friendly error on missing install."""
    try:
        import litellm

        return litellm
    except ImportError:
        raise ImportError(
            "LiteLLM is not installed. Install it with:\n"
            "  pip install litellm\n"
            "Or add 'litellm' to your agent's dependencies."
        )


class LitellmAgentRunner(AgentRunner[LlmConfig]):
    """
    AgentRunner[LlmConfig] backed by LiteLLM.

    Typed as AgentRunner[LlmConfig]: every call to _do_invoke / _do_stream
    receives a concrete LlmConfig — no isinstance checks, no fallback resolution.

    Uses LiteLLM's native async API (acompletion) for true async I/O — no thread pool.

    default_config resolves agent_config via default_slug (default: "high").
    To call with a different preset, pass agent_config.get_config("low") directly.

    Args:
        agent_config:    AgentConfig with LLM presets
        default_slug:    Which LLM preset to use for default_config ("high", "low", "mid", etc.)
        litellm_kwargs:  Extra kwargs passed to every litellm.acompletion() call
                         (e.g. api_key, api_base, timeout, metadata, etc.)
    """

    def __init__(
        self,
        agent_config: "AgentProfile | None" = None,
        default_slug: str = "default",
        *,
        agent_profile: "AgentProfile | None" = None,
        **litellm_kwargs: Any,
    ) -> None:
        super().__init__(agent_config=agent_config, agent_profile=agent_profile)
        self._default_slug = default_slug
        self._litellm_kwargs = litellm_kwargs

    # ------------------------------------------------------------------
    # default_config — resolves AgentProfile → LlmConfig for ExecutionStep
    # ------------------------------------------------------------------

    @property
    def default_config(self) -> LlmConfig:
        """
        Resolve and return the default LlmConfig for this runner.
        ExecutionStep uses this so it never touches AgentProfile directly.
        Falls back through get_config() — returns fallback_llm if slug not found.
        """
        return self.agent_profile.get_config(self._default_slug)

    # ------------------------------------------------------------------
    # Core invoke — calls litellm.acompletion() (native async, no thread pool)
    # ------------------------------------------------------------------

    async def _do_invoke(
        self, config: LlmConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AgentResponse:
        """
        Invoke LLM via LiteLLM async API (non-streaming).
        config is always a resolved LlmConfig — no AgentConfig fallback needed.
        Uses litellm.acompletion() for true async I/O without blocking the event loop.
        """
        litellm = _require_litellm()

        call_kwargs = {**self._litellm_kwargs, **kwargs}
        call_kwargs.pop("stream", None)  # ensure streaming is off

        logger.debug(
            "LitellmAgentRunner: invoke model={} messages={}",
            config.model,
            len(messages),
        )

        response = await litellm.acompletion(
            model=config.model,
            messages=[m.model_dump(exclude_none=True) for m in messages],
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            stream=False,
            **call_kwargs,
        )

        content = response.choices[0].message.content or ""
        raw_usage = response.usage
        usage = self._parse_usage(raw_usage)

        # Extract tool calls — parse into typed ToolCall objects
        raw_tool_calls: list[dict] = []
        msg = response.choices[0].message
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            raw_tool_calls = [tc.model_dump() for tc in msg.tool_calls]
        parsed_tool_calls = [ToolCall.from_raw(tc) for tc in raw_tool_calls]

        logger.debug(
            "LitellmAgentRunner: response model={} tokens={}/{} tool_calls={}",
            config.model,
            usage.prompt_tokens,
            usage.completion_tokens,
            len(parsed_tool_calls),
        )

        return AgentResponse(
            content=content,
            usage=usage,
            tool_calls=parsed_tool_calls,
            metadata={
                "tool_calls": raw_tool_calls,  # kept for backward compat
                "model": config.model,
                "finish_reason": response.choices[0].finish_reason,
                "provider": config.provider,
            },
        )

    # ------------------------------------------------------------------
    # Streaming invoke — real token-by-token streaming via LiteLLM async
    # ------------------------------------------------------------------

    async def _do_stream(
        self, config: LlmConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AsyncIterator[StreamChunk]:
        """
        Stream LLM response via LiteLLM async API (token-by-token).
        Each yielded StreamChunk is pushed to the Streamer by AgentCaller._handle_stream.
        config is always a resolved LlmConfig.
        Uses litellm.acompletion(stream=True) for true async streaming.
        """
        litellm = _require_litellm()

        call_kwargs = {**self._litellm_kwargs, **kwargs}
        call_kwargs.pop("stream", None)

        logger.debug(
            "LitellmAgentRunner: stream model={} messages={}",
            config.model,
            len(messages),
        )

        stream = await litellm.acompletion(
            model=config.model,
            messages=[m.model_dump(exclude_none=True) for m in messages],
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            stream=True,
            **call_kwargs,
        )

        async for chunk in stream:
            choice = chunk.choices[0]
            delta = choice.delta
            content_delta = delta.content or ""

            # Usage arrives in the final chunk (some providers only)
            usage_delta: Usage | None = None
            if hasattr(chunk, "usage") and chunk.usage is not None:
                usage_delta = self._parse_usage(chunk.usage)

            is_final = choice.finish_reason is not None

            yield StreamChunk(
                content_delta=content_delta,
                usage_delta=usage_delta,
                is_final=is_final,
                metadata={
                    "finish_reason": choice.finish_reason,
                    "model": config.model,
                },
            )

    # ------------------------------------------------------------------
    # Cost calculation via LiteLLM's built-in pricing
    # ------------------------------------------------------------------

    def _calc_cost(self, config: LlmConfig, usage: Usage | None) -> CostResult | None:
        """
        Calculate cost for an LLM invocation.

        Priority:
            1. config.input_cost_per_token / output_cost_per_token (explicit override)
               Use for custom/private models without LiteLLM auto-pricing.
            2. LiteLLM built-in completion_cost (auto-pricing for known models)
            3. None (unknown model, no pricing data)

        Also adds config.cost_per_call (flat fee per invocation) from CallerConfig.
        """
        if usage is None:
            return None

        flat_cost = config.cost_per_call  # inherited from CallerConfig (default 0.0)

        # Priority 1 — explicit per-token cost override
        if config.input_cost_per_token is not None or config.output_cost_per_token is not None:
            input_cost = (config.input_cost_per_token or 0.0) * usage.prompt_tokens
            output_cost = (config.output_cost_per_token or 0.0) * usage.completion_tokens
            total = input_cost + output_cost + flat_cost
            return CostResult(
                credit_cost=total,
                breakdown={
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                    "input_cost": input_cost,
                    "output_cost": output_cost,
                    "flat_cost": flat_cost,
                    "source": "explicit_override",
                },
            )

        # Priority 2 — LiteLLM auto-pricing
        try:
            litellm = _require_litellm()
            cost = litellm.completion_cost(
                model=config.model,
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
            )
            return CostResult(
                credit_cost=float(cost) + flat_cost,
                breakdown={"source": "litellm_auto", "flat_cost": flat_cost},
            )
        except Exception as e:
            logger.debug(
                "LitellmAgentRunner: cost calculation failed ({}), returning None", e
            )
            return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_usage(raw_usage: Any) -> Usage:
        """Parse LiteLLM usage object into our Usage type."""
        if raw_usage is None:
            return Usage()
        prompt = getattr(raw_usage, "prompt_tokens", 0) or 0
        completion = getattr(raw_usage, "completion_tokens", 0) or 0
        raw_dict: dict = {}
        if hasattr(raw_usage, "model_dump"):
            try:
                raw_dict = raw_usage.model_dump()
            except Exception:
                pass
        return Usage(
            prompt_tokens=prompt,
            completion_tokens=completion,
            request_count=1,
            raw=raw_dict,
        )
