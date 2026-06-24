"""
agent_sdk.exceptions
~~~~~~~~~~~~~~~~~~~~
Agent SDK exception hierarchy.

AgentConfigurationError
    Raised when an AgentProfile is misconfigured or when a required
    LlmConfig slug cannot be resolved.  Replaces the silent bare
    CallerConfig() fallback that previously hid misconfiguration.
"""
from __future__ import annotations


class AgentConfigurationError(Exception):
    """
    Raised when AgentProfile is misconfigured or a required LlmConfig is missing.

    Common causes:
      - AgentRunner.default_config() called on a runner whose AgentProfile has no
        'default' or 'fallback' LlmConfig set.
      - AgentProfile.get_config(slug) called with an unknown slug and no fallback_llm.

    Fix:
      - Set AgentProfile.default_llm or fallback_llm.
      - Or override default_config in your AgentRunner subclass to return CallerConfig()
        if your runner does not use an LLM (e.g. pure tool runners, echo agents).
    """
