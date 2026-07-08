"""
agent_sdk
~~~~~~~~~
Agent SDK — pure agent logic, infrastructure-agnostic.

Public API:
  Core:
    - BaseAgent          (ABC-ish base: the ONLY contract Engine/Runner depend on)
    - Agent              (BaseAgent subclass — plain/litellm variant. Use
                          Agent.litellm() / Agent.create() / Agent.simple() to build one,
                          or construct directly for fully custom runners)
    - AgentCaller        (ABC: base for all callers)
    - AgentRunner        (ABC: LLM caller — extend this for your agent)
    - ToolCaller         (calls tools; wraps ToolRegistry)
    - BaseTool           (ABC: extend this for each tool)
    - ToolResult         (structured success/error envelope from tool execution)
    - ToolRegistry       (manages tools; dispatches with timeout + safety)
    - AgentContext       (aggregates ToolCallers in a hierarchy)
    - ResumeCheck        (async hooks for resume/HITL/interrupt lifecycle management)
    - RunState           (typed protocol for ResumeCheck state parameters)
    - InputValidator     (ABC: injectable knob behind BaseAgent.validate_input())
    - PassthroughInputValidator (default InputValidator — no-op)
    - HitlAction         (typed HITL pause shape: id/question/description/options/response)
    - HitlResponseInput  (typed HITL answer shape: action_id + response)

  Execution:
    - ExecutionStep      (ABC: one run — developer implements run())
    - DefaultExecutionStep (single-turn, no tool calls)
    - ReActExecutionStep (built-in ReAct tool loop — LLM → tools → loop)
    - StepContext        (input context for each step)
    - StepResult         (output from each step)
    - StepStatus         (COMPLETE | CONTINUE | ERROR | INTERRUPTED | HITL)

  Factories (classmethods on the agent classes themselves — see design note
  in agent_sdk.agent module docstring):
    - Agent.litellm()          lowest-level, full manual control
    - Agent.create()           full-featured factory (requires AgentProfile)
    - Agent.simple()           minimal factory (accepts model+provider directly)
    - LangGraphAgent.create()  factory for LangGraph StateGraph-backed agents
                               (optional — requires the `langgraph` extra)
    Deprecated module-level shims (still work, just call the above):
    create_agent(), create_simple_agent(), create_langgraph_agent()

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
from agent_sdk.agent import Agent, BaseAgent, create_agent, create_simple_agent
from agent_sdk.agent_context import AgentContext
from agent_sdk.agent_profile import AgentProfile, LlmConfig  # noqa: F811 — re-export canonical
from agent_sdk.agent_runner import AgentRunner, LitellmAgentRunner
from agent_sdk.caller import AgentCaller
from agent_sdk.caller_config import CallerConfig
from agent_sdk.decorators import tool
from agent_sdk.exceptions import AgentConfigurationError
from agent_sdk.hitl import HitlAction, HitlResponseInput
from agent_sdk.input_validator import InputValidator, PassthroughInputValidator

# Optional LangGraph integration. Safe to import unconditionally — nothing in
# agent_sdk.langgraph imports langgraph/langchain-core at module level, only
# at call time (see agent_sdk/langgraph/__init__.py).
from agent_sdk.langgraph import (
    LangGraphAgent,
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
    "BaseAgent",
    "Agent",
    "LangGraphAgent",
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
    "InputValidator",
    "PassthroughInputValidator",
    "HitlAction",
    "HitlResponseInput",
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
