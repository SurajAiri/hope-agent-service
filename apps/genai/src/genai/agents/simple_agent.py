"""
genai.agents.simple_agent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
A basic single-turn agent using Agent.simple() — the absolute minimum boilerplate.

Demonstrates:
  - Agent.simple(): accepts model + provider directly (no AgentProfile needed)
  - Resulting agent uses DefaultExecutionStep (single-turn, no tools)
  - system_prompt is set directly in the factory call
"""

from agent_sdk import Agent


def simple_agent_factory(agent_id: str) -> Agent:
    """
    Factory for the simple agent.
    Uses Agent.simple() — minimum boilerplate, no AgentProfile required.
    Returns a single-turn agent with DefaultExecutionStep.
    """
    return Agent.simple(
        agent_id,
        model="fireworks_ai/accounts/fireworks/models/deepseek-v4-flash",
        provider="fireworks_ai",
        system_prompt="You are a helpful assistant. Answer clearly and concisely.",
    )
