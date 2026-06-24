"""
agent_sdk.agent_runner
~~~~~~~~~~~~~~~~~~~~~~
AgentRunner — the LLM caller. Extends AgentCaller[TLlmConfig].

Concrete agents inherit from AgentRunner and implement:
  - async _do_invoke(config, messages, **kwargs) -> AgentResponse
  - async _do_stream(config, messages, **kwargs) -> AsyncIterator[StreamChunk]  (if streaming)

AgentRunner holds an AgentProfile and provides:
  - The LLM invocation interface (_do_invoke / _do_stream).
  - default_config property: resolves AgentProfile to a concrete LlmConfig so
    ExecutionStep can call agent_runner.invoke(config=agent_runner.default_config, ...).

It knows nothing about infrastructure, redis, db, or s3.

KEY DISTINCTION:
  AgentProfile — aggregator, never passed to invoke()
  LlmConfig    — concrete CallerConfig, passed to invoke()
  AgentRunner  — bridges the two
"""
from __future__ import annotations

import abc
from typing import Any, AsyncIterator, TypeVar

from agent_sdk.agent_profile import AgentProfile, LlmConfig
from agent_sdk.caller import AgentCaller
from agent_sdk.caller_config import CallerConfig
from agent_sdk.exceptions import AgentConfigurationError
from agent_sdk.messages import AnyMessage
from agent_sdk.types import AgentResponse, StreamChunk

# TypeVar for AgentRunner subclasses — bound to LlmConfig so only LLM configs flow through.
TLlmConfig = TypeVar("TLlmConfig", bound=LlmConfig)


class AgentRunner(AgentCaller[TLlmConfig], abc.ABC):
    """
    Abstract LLM caller. Concrete agents implement _do_invoke and optionally _do_stream.

    Generic[TLlmConfig] ensures the config flowing through invoke / _do_invoke / _do_stream
    is always a resolved LlmConfig (or a subclass), never a raw AgentProfile.

    Usage::

        class MyRunner(AgentRunner[LlmConfig]):
            async def _do_invoke(self, config: LlmConfig, messages, **kwargs):
                response = await openai.chat.completions.acreate(...)
                return AgentResponse(content=response.choices[0].message.content, ...)

    For runners that do NOT use an LLM (e.g. pure echo/tool demo runners):
        - Override default_config to return CallerConfig() explicitly.
        - This documents the intent and prevents AgentConfigurationError.

        class EchoRunner(AgentRunner):
            @property
            def default_config(self) -> CallerConfig:
                return CallerConfig()  # no LLM, no config needed

    AgentProfile (new name) vs AgentConfig (deprecated alias):
        Both work. self.agent_profile is the canonical field.
        self.agent_config is a back-compat property pointing to self.agent_profile.
    """

    def __init__(
        self,
        agent_config: "AgentProfile | None" = None,
        *,
        agent_profile: "AgentProfile | None" = None,
    ) -> None:
        """
        Args:
            agent_config:   AgentProfile instance. Accepted for back-compat
                            (callers using keyword agent_config= still work).
            agent_profile:  AgentProfile instance. Preferred new name.
                            Takes priority over agent_config if both are provided.
        """
        _profile = agent_profile if agent_profile is not None else agent_config
        if _profile is None:
            raise AgentConfigurationError(
                "AgentRunner requires an AgentProfile. "
                "Pass it as agent_profile=... or agent_config=... (deprecated name)."
            )
        self.agent_profile: AgentProfile = _profile

    @property
    def agent_config(self) -> AgentProfile:
        """
        Back-compat alias for agent_profile.
        Deprecated: use self.agent_profile directly.
        """
        return self.agent_profile

    @property
    def default_config(self) -> CallerConfig:
        """
        Return the default LlmConfig for this runner.

        Base implementation: tries 'default' then 'fallback' slugs from agent_profile.
        Raises AgentConfigurationError if neither is configured — NO silent bare CallerConfig().

        Runners that do not use an LLM (pure tool/echo runners) MUST override this
        and return CallerConfig() explicitly to document the intent:

            @property
            def default_config(self) -> CallerConfig:
                return CallerConfig()

        LLM runners (e.g. LitellmAgentRunner) override this to return their preferred
        preset:
            @property
            def default_config(self) -> LlmConfig:
                return self.agent_profile.get_config(self._default_slug)

        ExecutionStep usage::

            await agent_runner.invoke(config=agent_runner.default_config, messages=..., stream=...)
        """
        for slug in ("default", "fallback"):
            try:
                return self.agent_profile.get_config(slug)
            except (ValueError, KeyError):
                continue
        raise AgentConfigurationError(
            f"Agent '{self.agent_profile.agent_id}' has no 'default' or 'fallback' "
            "LlmConfig configured in its AgentProfile. "
            "Set AgentProfile.default_llm or fallback_llm, "
            "or override default_config in your runner to return CallerConfig() "
            "if this runner does not use an LLM."
        )

    @abc.abstractmethod
    async def _do_invoke(
        self, config: TLlmConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AgentResponse:
        """
        Concrete async LLM invocation.
        Receives a resolved LlmConfig and the message list.
        Returns a final AgentResponse.
        """
        ...

    async def _do_stream(
        self, config: TLlmConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AsyncIterator[StreamChunk]:
        """
        LLM callers that support real streaming override this.
        Default falls back to invoke-as-single-chunk (from AgentCaller base).
        """
        async for chunk in super()._do_stream(config, messages=messages, **kwargs):
            yield chunk
