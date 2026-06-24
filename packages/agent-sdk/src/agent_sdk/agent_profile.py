"""
agent_sdk.agent_profile
~~~~~~~~~~~~~~~~~~~~~~~
AgentProfile — the aggregator/registry of LLM configurations for an agent.
LlmConfig    — one concrete LLM model + provider configuration.

KEY DISTINCTION (non-negotiable):
  AgentProfile is NOT a CallerConfig.
  It is an aggregator.  It is never passed to AgentCaller.invoke().
  Concrete LlmConfig instances (resolved from AgentProfile) ARE CallerConfigs
  and ARE passed to AgentCaller.invoke().

Preset resolution:
  AgentProfile holds up to 4 named typed slots (default_llm, fallback_llm,
  fast_llm, strong_llm) PLUS an arbitrary presets dict.
  At construction time, @model_validator syncs the typed slots INTO the
  presets dict so that get_config() has exactly ONE lookup path:
      presets[slug] → fallback_llm → ValueError

  Typed slots take priority over same-key entries in presets.

Migration from AgentConfig:
  AgentConfig is an alias for AgentProfile (deprecated name, kept for one cycle).
  Old code using AgentConfig continues to work without any changes.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from agent_sdk.caller_config import CallerConfig


class LlmConfig(CallerConfig):
    """
    Concrete LLM configuration for one model + provider.

    Extends CallerConfig — so every LlmConfig IS-A CallerConfig and can be
    passed directly to AgentCaller.invoke() / UsageTracker.log().

    resource_type is auto-set to "llm".
    resource_id   is auto-set to model (can be overridden by passing it explicitly).

    Args:
        model:                  LiteLLM model string, e.g. "gpt-4o",
                                "claude-3-5-sonnet-20241022", "gemini/gemini-2.0-flash".
        provider:               Provider name, e.g. "openai", "anthropic", "gemini".
        temperature:            Sampling temperature (default 0.7).
        max_tokens:             Max completion tokens (default 4096).
        extras:                 Provider-specific extra kwargs forwarded to
                                litellm.acompletion().
        input_cost_per_token:   Optional per-token cost override for prompt tokens.
                                When set, used instead of LiteLLM auto-pricing.
                                Useful for custom/private models without LiteLLM pricing.
        output_cost_per_token:  Optional per-token cost override for completion tokens.
    """

    model: str = ""
    provider: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    extras: dict[str, Any] = Field(default_factory=dict)

    # Per-token cost overrides — optional, used instead of LiteLLM auto-pricing when set.
    input_cost_per_token: float | None = None
    output_cost_per_token: float | None = None

    @model_validator(mode="after")
    def _set_defaults(self) -> "LlmConfig":
        if not self.model:
            raise ValueError("LlmConfig requires 'model'")
        if not self.provider:
            raise ValueError("LlmConfig requires 'provider'")
        if not self.resource_type:
            self.resource_type = "llm"
        if not self.resource_id:
            self.resource_id = self.model
        return self


class AgentProfile(BaseModel):
    """
    Configuration aggregator for an agent — named LLM presets + run settings.

    AgentProfile is NOT a CallerConfig.  It is the developer-facing object
    that holds all LLM configurations for an agent and is passed to AgentRunner.
    At call-time, a concrete LlmConfig is resolved from it via get_config(slug).

    Preset resolution (single lookup path):
        1. presets[slug]     — populated from typed slots at construction time
        2. fallback_llm      — used when slug is not in presets
        3. ValueError        — raised with a helpful message

    Typed slots (ergonomic named fields):
        default_llm   — general-purpose default
        fallback_llm  — used when slug not found; also the safety net
        fast_llm      — low-latency / cheap model for simple tasks
        strong_llm    — most capable model for complex reasoning

    Custom presets:
        presets = {"vision": LlmConfig(...), "summary": LlmConfig(...)}

    Both typed slots and presets dict can be used together.
    Typed slots always win over same-key entries in presets.

    Example::

        profile = AgentProfile(
            agent_id="my-agent",
            max_iterations=15,
            system_prompt="You are a helpful assistant.",
            default_llm=LlmConfig(model="gpt-4o", provider="openai"),
            fast_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
            fallback_llm=LlmConfig(model="gpt-4o-mini", provider="openai"),
            presets={
                "vision": LlmConfig(model="gpt-4o", provider="openai"),
            },
        )
        config = profile.get_config("default")   # → default_llm
        config = profile.get_config("vision")    # → presets["vision"]
        config = profile.get_config("unknown")   # → fallback_llm
    """

    agent_id: str

    # Run control
    max_iterations: int = 50

    # System prompt — injected by DefaultExecutionStep / ReActExecutionStep
    # if not already present in the message list.
    system_prompt: str | None = None

    # Typed canonical slots
    default_llm: LlmConfig | None = None   # general-purpose default
    fallback_llm: LlmConfig | None = None  # used when slug not found
    fast_llm: LlmConfig | None = None      # low-latency / cheap model
    strong_llm: LlmConfig | None = None    # most capable model

    # Arbitrary custom presets: slug → LlmConfig
    presets: dict[str, LlmConfig] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _sync_slots_into_presets(self) -> "AgentProfile":
        """
        Sync typed slots into presets so get_config() has one lookup path.
        Typed slot takes priority over same-key entry in presets dict.
        """
        for slug, cfg in [
            ("default", self.default_llm),
            ("fallback", self.fallback_llm),
            ("fast", self.fast_llm),
            ("strong", self.strong_llm),
        ]:
            if cfg is not None:
                self.presets[slug] = cfg
        return self

    def get_config(self, slug: str) -> LlmConfig:
        """
        Resolve a slug to a concrete LlmConfig.

        Lookup order:
            1. presets[slug]    (includes synced typed slots)
            2. fallback_llm     (safety net when slug not found)
            3. ValueError       (clear error — no silent returns)

        Built-in slugs (via typed slots):
            "default", "fallback", "fast", "strong"

        Custom slugs:
            Any key in the presets dict.
        """
        cfg = self.presets.get(slug)
        if cfg is not None:
            return cfg
        if self.fallback_llm is not None:
            return self.fallback_llm
        raise ValueError(
            f"No LlmConfig found for slug '{slug}' and no fallback_llm configured "
            f"on agent '{self.agent_id}'. "
            f"Set AgentProfile.{slug}_llm, AgentProfile.fallback_llm, "
            f"or add '{slug}' to AgentProfile.presets."
        )


# ---------------------------------------------------------------------------
# Back-compat alias — deprecated, use AgentProfile.
# AgentConfig will be removed in a future release.
# ---------------------------------------------------------------------------
AgentConfig = AgentProfile
