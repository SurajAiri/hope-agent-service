"""
agent_sdk.agent_config
~~~~~~~~~~~~~~~~~~~~~~
REMOVED \u2014 use agent_sdk.agent_profile (AgentProfile) instead.

This module previously contained the AgentConfig back-compat alias for
AgentProfile.  That alias has now been removed.

Migration:
    Old import                              New import
    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    from agent_sdk.agent_config import AgentConfig   \u2192 from agent_sdk import AgentProfile
    from agent_sdk.agent_config import LlmConfig     \u2192 from agent_sdk import LlmConfig
    AgentConfig(agent_id=..., high_llm=...)          \u2192 AgentProfile(agent_id=..., default_llm=...)

Renamed presets (old \u2192 new):
    high_llm       \u2192 default_llm  (or strong_llm for the most capable model)
    low_llm        \u2192 fast_llm
    mid_llm        \u2192 presets={"mid": LlmConfig(...)}
    coder_llm      \u2192 presets={"coder": LlmConfig(...)}
    summarizer_llm \u2192 presets={"summarizer": LlmConfig(...)}
    memory_llm     \u2192 presets={"memory": LlmConfig(...)}
    fallback_llm   \u2192 fallback_llm  (unchanged)
    extras         \u2192 presets  (dict key stays the same)
"""
from __future__ import annotations

# Re-export AgentProfile and LlmConfig from the canonical location.
# AgentConfig alias has been removed \u2014 use AgentProfile directly.
from agent_sdk.agent_profile import AgentProfile, LlmConfig  # noqa: F401

__all__ = [
    "AgentProfile",
    "LlmConfig",
]