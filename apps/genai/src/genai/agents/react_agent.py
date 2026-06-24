"""
genai.agents.react_agent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
A ReAct agent that loops between LLM generation and tool execution.

Demonstrates:
  - create_agent(): full-featured factory with AgentProfile
  - ReActExecutionStep: built-in SDK step, no manual tool-loop code needed
  - Typed tool_calls via response.tool_calls (list[ToolCall]) — no json.loads
"""

from agent_sdk import Agent, AgentProfile, LlmConfig, ReActExecutionStep, create_agent

# Import the demo tools from echo_agent
from genai.agents.echo_agent import TimestampTool, UpperCaseTool

# ReAct agent profile — uses fallback_llm for all calls
_REACT_PROFILE = AgentProfile(
    agent_id="react",
    max_iterations=15,
    system_prompt=(
        "You are a helpful assistant with access to tools. "
        "Use tools when needed, then summarize the results clearly."
    ),
    fallback_llm=LlmConfig(
        model="fireworks_ai/accounts/fireworks/models/deepseek-v4-flash",
        provider="fireworks_ai",
    ),
)


def react_agent_factory(agent_id: str) -> Agent:
    """
    Factory for the ReAct agent.

    Uses create_agent() + ReActExecutionStep — no manual tool-loop code needed.
    Tool schemas are passed to the LLM automatically by the runner (via ToolCaller).
    """
    return create_agent(
        agent_id,
        agent_profile=_REACT_PROFILE,
        tools=[UpperCaseTool(), TimestampTool()],
        execution_step=ReActExecutionStep(max_tool_rounds=5),
        metadata={"description": "ReAct agent with uppercase and timestamp tools"},
    )
