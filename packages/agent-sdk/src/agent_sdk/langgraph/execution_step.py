"""
agent_sdk.langgraph.execution_step
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
LangGraphExecutionStep — translates between the platform's
StepResult/StepStatus contract and LangGraph's own run/interrupt/resume
model.

One call to run() == one full LangGraph run — from the initial input (or a
Command(resume=...) if we're coming back from a HITL pause) through to
either completion or the next interrupt. There is no CONTINUE case here:
LangGraph's own Pregel loop already drives its internal superstep loop, so
run() always ends in COMPLETE or HITL (or lets an exception from
agent_runner.invoke() bubble up to Engine, same as every other
ExecutionStep). Segmenting a single graph run across multiple Engine loop
iterations (e.g. to interleave budget checks between LangGraph supersteps)
is possible but out of scope for this V1 wrapper.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from agent_sdk.execution_step import ExecutionStep, StepContext, StepResult, StepStatus
from agent_sdk.langgraph.runner import CHECKPOINT_STATE_KEY, MSG_COUNT_STATE_KEY

if TYPE_CHECKING:
    from agent_sdk.agent_context import AgentContext
    from agent_sdk.agent_runner import AgentRunner


class LangGraphExecutionStep(ExecutionStep):
    """
    ExecutionStep for LangGraph-backed agents. Pair with LangGraphAgentRunner
    and LangGraphResumeCheck — create_langgraph_agent() wires all three
    together for you.
    """

    async def run(
        self,
        agent_runner: "AgentRunner",
        agent_context: "AgentContext",
        context: StepContext,
    ) -> StepResult:
        response = await agent_runner.invoke(
            config=agent_runner.default_config,
            stream=context.stream,
            messages=context.messages,
            state_data=context.state_data,
        )
        meta = response.metadata

        new_messages = meta.get("new_messages", [])
        updated_messages = list(context.messages) + list(new_messages)

        state_data_update = {MSG_COUNT_STATE_KEY: meta.get(MSG_COUNT_STATE_KEY, 0)}

        if meta.get("interrupted"):
            # Graph paused on an interrupt() call — carry the checkpointer
            # forward so the next run (after a human answers) can resume
            # exactly where it left off, and surface the interrupt payload(s)
            # as HITL actions for Engine to persist.
            state_data_update[CHECKPOINT_STATE_KEY] = meta[CHECKPOINT_STATE_KEY]
            return StepResult(
                status=StepStatus.HITL,
                messages=updated_messages,
                state_data=state_data_update,
                hitl_actions=meta.get("interrupt_actions", []),
                metadata={"run_id": context.run_id},
            )

        # Prefer metadata["output"] (always set by LangGraphAgentRunner._finish,
        # via output_adapter) over response.content: in the streaming path,
        # AgentCaller._handle_stream builds .content purely by concatenating
        # on_chat_model_stream deltas, which is empty whenever the graph's
        # final node doesn't stream tokens through a chat model (e.g. a plain
        # canned message, or a non-streaming model call).
        output = meta.get("output", response.content)

        return StepResult(
            status=StepStatus.COMPLETE,
            messages=updated_messages,
            output=output,
            state_data=state_data_update,
            metadata={"run_id": context.run_id},
        )
