"""
agent_sdk
~~~~~~~~~
Agent SDK — pure agent logic, infrastructure-agnostic.

Public API:
  Core:
    - Agent              (container for all agent components — returned by factory)
    - AgentCaller        (ABC: base for all callers)
    - AgentRunner        (ABC: LLM caller — extend this for your agent)
    - ToolCaller         (calls tools; wraps ToolRegistry)
    - BaseTool           (ABC: extend this for each tool)
    - ToolResult         (structured success/error envelope from tool execution)
    - ToolRegistry       (manages tools; dispatches with timeout + safety)
    - AgentContext       (aggregates ToolCallers in a hierarchy)
    - ResumeCheck        (hooks for lifecycle management)
    - RunState           (typed protocol for ResumeCheck state parameters)

  Execution:
    - ExecutionStep      (ABC: one run — developer implements run())
    - DefaultExecutionStep (single-turn, no tool calls)
    - ReActExecutionStep (built-in ReAct tool loop — LLM → tools → loop)
    - StepContext        (input context for each step)
    - StepResult         (output from each step)
    - StepStatus         (COMPLETE | CONTINUE | ERROR | INTERRUPTED | HITL)

  Factories:
    - create_agent()        full-featured factory (requires AgentProfile)
    - create_simple_agent() minimal factory (accepts model+provider directly)
    - create_langgraph_agent() factory for LangGraph StateGraph-backed agents
                               (optional — requires the `langgraph` extra)

  Decorators:
    - tool               (@tool decorator: async function → BaseTool instance)

  LLM Runners:
    - LitellmAgentRunner (AgentRunner backed by LiteLLM — 100+ providers)
    - LangGraphAgentRunner, LangGraphExecutionStep, LangGraphResumeCheck
                         (agent_sdk.langgraph — LangGraph StateGraph support,
                          including HITL via interrupt()/Command(resume=...))

  Config:
    - CallerConfig       (base for all caller configs — extend for custom callers)
    - ToolCallConfig     (config for a single tool invocation)
    - AgentProfile       (agent configuration: LLM presets + max_runs + system_prompt)
    - AgentConfig        (deprecated alias for AgentProfile — back-compat only)
    - LlmConfig          (one LLM model+provider configuration — extends CallerConfig)

  Types:
    - AgentResponse      (response from AgentCaller.invoke())
    - ToolCall           (typed tool call from LLM — replaces raw dict juggling)
    - StreamChunk        (one SSE chunk from streaming invoke)
    - Usage              (token usage tracking)
    - CostResult         (cost result for billing)

  Exceptions:
    - AgentConfigurationError  (misconfigured AgentProfile or missing LlmConfig)
"""
from agent_sdk.agent import Agent, create_agent, create_simple_agent
from agent_sdk.agent_config import AgentConfig, LlmConfig  # back-compat shim
from agent_sdk.agent_context import AgentContext
from agent_sdk.agent_profile import AgentProfile, LlmConfig  # noqa: F811 — re-export canonical
from agent_sdk.agent_runner import AgentRunner, LitellmAgentRunner
from agent_sdk.caller import AgentCaller
from agent_sdk.caller_config import CallerConfig
from agent_sdk.decorators import tool
from agent_sdk.exceptions import AgentConfigurationError

# Optional LangGraph integration. Safe to import unconditionally — nothing in
# agent_sdk.langgraph imports langgraph/langchain-core at module level, only
# at call time (see agent_sdk/langgraph/__init__.py).
from agent_sdk.langgraph import (
    LangGraphAgentRunner,
    LangGraphExecutionStep,
    LangGraphResumeCheck,
    create_langgraph_agent,
)
from agent_sdk.execution_step import (
    DefaultExecutionStep,
    ExecutionStep,
    ReActExecutionStep,
    StepContext,
    StepResult,
    StepStatus,
)
from agent_sdk.messages import (
    AnyMessage,
    AssistantMessage,
    HumanMessage,
    Message,
    SystemMessage,
    ToolCallMessage,
    parse_message,
)
from agent_sdk.resume_check import ResumeCheck, RunState
from agent_sdk.tools import BaseTool, ToolCallConfig, ToolCaller, ToolRegistry, ToolResult
from agent_sdk.types import AgentResponse, CostResult, StreamChunk, ToolCall, Usage

__all__ = [
    # Core
    "Agent",
    "AgentCaller",
    "AgentRunner",
    "ToolCaller",
    "BaseTool",
    "ToolResult",
    "ToolRegistry",
    "ToolCallConfig",
    "AgentContext",
    "ResumeCheck",
    "RunState",
    # Execution
    "ExecutionStep",
    "DefaultExecutionStep",
    "ReActExecutionStep",
    "Message",
    "AnyMessage",
    "SystemMessage",
    "HumanMessage",
    "AssistantMessage",
    "ToolCallMessage",
    "parse_message",
    "StepContext",
    "StepResult",
    "StepStatus",
    # Factories
    "create_agent",
    "create_simple_agent",
    "create_langgraph_agent",
    # Decorators
    "tool",
    # LLM runners
    "LitellmAgentRunner",
    "LangGraphAgentRunner",
    "LangGraphExecutionStep",
    "LangGraphResumeCheck",
    # Config
    "CallerConfig",
    "AgentProfile",
    "AgentConfig",   # deprecated alias → AgentProfile
    "LlmConfig",
    # Types
    "AgentResponse",
    "ToolCall",
    "StreamChunk",
    "Usage",
    "CostResult",
    # Exceptions
    "AgentConfigurationError",
]
