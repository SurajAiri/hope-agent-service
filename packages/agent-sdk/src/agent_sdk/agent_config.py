"""
agent_sdk.agent_config
~~~~~~~~~~~~~~~~~~~~~~
DEPRECATED — use agent_sdk.agent_profile instead.

This module is kept for one release cycle as a backward-compatibility shim.
All symbols are re-exported from agent_sdk.agent_profile.

Migration:
    Old import                              New import
    ─────────────────────────────────────── ────────────────────────────────────────
    from agent_sdk.agent_config import AgentConfig   → from agent_sdk import AgentProfile
    from agent_sdk.agent_config import LlmConfig     → from agent_sdk import LlmConfig
    AgentConfig(agent_id=..., high_llm=...)          → AgentProfile(agent_id=..., default_llm=...)

Renamed presets (old → new):
    high_llm       → default_llm  (or strong_llm for the most capable model)
    low_llm        → fast_llm
    mid_llm        → presets={"mid": LlmConfig(...)}
    coder_llm      → presets={"coder": LlmConfig(...)}
    summarizer_llm → presets={"summarizer": LlmConfig(...)}
    memory_llm     → presets={"memory": LlmConfig(...)}
    fallback_llm   → fallback_llm  (unchanged)
    extras         → presets  (dict key stays the same)
"""
from __future__ import annotations

# Re-export everything from the new canonical location.
from agent_sdk.agent_profile import AgentConfig, AgentProfile, LlmConfig  # noqa: F401

__all__ = [
    "AgentConfig",   # deprecated alias → AgentProfile
    "AgentProfile",
    "LlmConfig",
]