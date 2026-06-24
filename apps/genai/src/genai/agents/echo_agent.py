"""
genai.agents.echo_agent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
EchoAgent — demo agent that echoes the user's last message.

Demonstrates the complete developer-facing surface:
  - EchoAgentRunner (extends AgentRunner): implements _do_invoke + _do_stream
  - EchoExecutionStep (extends ExecutionStep): developer FULLY controls step logic
  - Two demo Tools: UpperCaseTool, TimestampTool
  - echo_agent_factory(): returns Agent (not a tuple)

Key point: EchoExecutionStep.run() is the developer's code space.
It decides how to call the runner, whether to use tools, when to return COMPLETE/CONTINUE.
The SDK's ExecutionStep just provides the interface (ABC) — no logic baked in.

No LLM required — works with docker-compose setup alone.
"""

from __future__ import annotations

import time
from typing import Any

from agent_sdk import (
    Agent,
    AgentContext,
    AgentProfile,
    AgentRunner,
    create_agent,
)
from agent_sdk.caller_config import CallerConfig
from agent_sdk.execution_step import ExecutionStep, StepContext, StepResult, StepStatus
from agent_sdk.messages import AnyMessage, HumanMessage
from agent_sdk.tools import BaseTool, ToolCaller, ToolResult
from agent_sdk.types import AgentResponse, StreamChunk, Usage
from loguru import logger
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Demo Tools — registered in AgentContext
# ---------------------------------------------------------------------------


class UpperCaseParams(BaseModel):
    """Parameters for the uppercase tool."""

    text: str = Field(..., description="The text to convert to uppercase")


class UpperCaseTool(BaseTool):
    """Converts input text to uppercase. Demo tool to show tool injection."""

    name = "uppercase"
    description = "Converts input text to uppercase"
    parameters_model = UpperCaseParams
    timeout = 5.0
    dangerous = False

    async def _execute(self, params: UpperCaseParams) -> ToolResult:
        result = params.text.upper()
        logger.debug("UpperCaseTool: '{}' → '{}'", params.text[:50], result[:50])
        return ToolResult.ok(
            output=result,
            metadata={"original": params.text, "transformed": result},
        )


class TimestampParams(BaseModel):
    """Parameters for the timestamp tool (no required args)."""

    format: str = Field("unix", description="Output format: 'unix' (default) or 'iso'")


class TimestampTool(BaseTool):
    """Returns current Unix timestamp. Demo tool."""

    name = "get_timestamp"
    description = "Returns the current Unix timestamp or ISO-formatted datetime"
    parameters_model = TimestampParams
    timeout = 5.0
    dangerous = False

    async def _execute(self, params: TimestampParams) -> ToolResult:
        import datetime

        ts = int(time.time())
        if params.format == "iso":
            output = datetime.datetime.utcfromtimestamp(ts).isoformat() + "Z"
        else:
            output = str(ts)

        logger.debug("TimestampTool: returning {}", output)
        return ToolResult.ok(
            output=output,
            metadata={"timestamp": ts, "format": params.format},
        )


# ---------------------------------------------------------------------------
# EchoAgentRunner — implements the LLM calls (no real LLM here)
# ---------------------------------------------------------------------------


class EchoAgentRunner(AgentRunner):
    """
    Echo agent — returns the user's last message prefixed with "Echo: ".
    Supports word-by-word streaming via _do_stream.

    This runner does NOT use an LLM, so it overrides default_config to return
    CallerConfig() explicitly. This is the documented pattern for non-LLM runners.
    """

    @property
    def default_config(self) -> CallerConfig:
        """
        No LLM used — return bare CallerConfig.
        Required by the new AgentRunner design: runners without an LLM must
        override this to avoid AgentConfigurationError.
        """
        return CallerConfig()

    async def _do_invoke(
        self, config: Any, messages: list[AnyMessage], **kwargs: Any
    ) -> AgentResponse:
        """Non-streaming: build and return the echo response."""
        last_user_msg = self._extract_last_user_message(messages)
        echo_text = f"Echo: {last_user_msg}"
        word_count = len(echo_text.split())

        logger.debug(
            "EchoAgentRunner: invoke | input='{}' output='{}'",
            last_user_msg[:50],
            echo_text[:50],
        )

        return AgentResponse(
            content=echo_text,
            usage=Usage(
                prompt_tokens=len(last_user_msg.split()),
                completion_tokens=word_count,
            ),
        )

    async def _do_stream(self, config: Any, messages: list[AnyMessage], **kwargs: Any):
        """Streaming: yield one chunk per word."""
        last_user_msg = self._extract_last_user_message(messages)
        echo_text = f"Echo: {last_user_msg}"
        words = echo_text.split()

        logger.debug("EchoAgentRunner: stream start | words={}", len(words))

        for i, word in enumerate(words):
            is_final = i == len(words) - 1
            yield StreamChunk(
                content_delta=word + ("" if is_final else " "),
                usage_delta=Usage(
                    prompt_tokens=len(last_user_msg.split()), completion_tokens=1
                )
                if is_final
                else None,
                is_final=is_final,
            )

    @staticmethod
    def _extract_last_user_message(messages: list[AnyMessage]) -> str:
        """Find the most recent user message."""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                return msg.content or ""
            # Fallback if parsed as dict or BaseMessage
            if getattr(msg, "role", None) == "user":
                return msg.content or ""
        return "(no user message)"


# ---------------------------------------------------------------------------
# EchoExecutionStep — developer-controlled step logic
# ---------------------------------------------------------------------------


class EchoExecutionStep(ExecutionStep):
    """
    One iteration of the execution loop for the echo agent.

    Developer fully controls what happens here:
      - When to call agent_runner.invoke()
      - Whether to call tools
      - How to update messages
      - When to return COMPLETE vs CONTINUE

    This particular step:
      1. Calls agent_runner.invoke() with current messages
      2. Appends assistant message
      3. Signals COMPLETE immediately (echo is always a single-turn response)
    """

    async def run(
        self,
        agent_runner: AgentRunner,
        agent_context: AgentContext,
        context: StepContext,
    ) -> StepResult:
        logger.info(
            "EchoExecutionStep: run | iter={} messages={} stream={}",
            context.iteration,
            len(context.messages),
            context.stream,
        )

        # EchoAgentRunner doesn't use LLM — default_config returns CallerConfig().
        # _do_invoke ignores the config; invoke() is async — must be awaited.
        response: AgentResponse = await agent_runner.invoke(
            config=agent_runner.default_config,
            stream=context.stream,
            messages=context.messages,
        )

        # Use to_assistant_message() — handles content + tool_calls in one call
        updated_messages = list(context.messages) + [response.to_assistant_message()]

        logger.info(
            "EchoExecutionStep: complete | output='{}'", (response.content or "")[:80]
        )

        # COMPLETE: echo is always single-turn
        return StepResult(
            status=StepStatus.COMPLETE,
            messages=updated_messages,
            output=response.content,
            metadata={"agent": "echo", "iteration": context.iteration},
        )


# ---------------------------------------------------------------------------
# Factory — registered with Runner
# ---------------------------------------------------------------------------


def echo_agent_factory(agent_id: str) -> Agent:
    """
    Developer factory function. Returns an Agent object.
    Called fresh on every trigger_run() — components are lightweight.

    Demonstrates create_agent() with a custom runner override:
    EchoAgentRunner is wired manually since it doesn't use LiteLLM.
    """
    logger.debug("echo_agent_factory: creating agent '{}'", agent_id)

    # EchoAgentRunner doesn't use LLM — AgentProfile is still required to carry agent_id.
    profile = AgentProfile(agent_id=agent_id)
    runner = EchoAgentRunner(agent_profile=profile)

    # Use tools= shorthand (AgentContext created internally)
    agent_context = AgentContext(tools=[UpperCaseTool(), TimestampTool()])
    # Note: parent will be set by Runner to runner-level shared AgentContext

    return Agent(
        agent_id=agent_id,
        runner=runner,
        agent_context=agent_context,
        execution_step=EchoExecutionStep(),
        metadata={"version": "2.0", "description": "Echo demo agent"},
    )
