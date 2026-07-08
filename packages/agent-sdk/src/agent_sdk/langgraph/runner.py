"""
agent_sdk.langgraph.runner
~~~~~~~~~~~~~~~~~~~~~~~~~~
LangGraphAgentRunner — AgentRunner that drives a compiled LangGraph graph
instead of calling an LLM provider directly.

Why this is still an AgentRunner even though LangGraph makes its own LLM
calls internally (invisibly to our AgentCaller pipeline):
  - Agent (the SDK container) requires a `runner: AgentRunner` — routing
    LangGraph through the same contract keeps it a first-class citizen next
    to LitellmAgentRunner instead of inventing a parallel Agent-like type.
  - Calling through AgentCaller.invoke() keeps the existing usage-tracker /
    streamer / error-logging plumbing firing (usage will read 0 — LangGraph's
    internal LLM calls aren't visible to our UsageTracker unless you bridge
    a LangChain callback handler into it yourself; that's a legitimate V2
    extension, not attempted here).

What actually happens on invoke():
  1. Compile the developer's graph_builder() output with a checkpointer.
     - First run for a session: fresh InMemorySaver, fresh input built by
       input_adapter(messages).
     - Later run (a HITL interrupt already happened once): restore the
       checkpointer from state_data and call the graph with
       Command(resume=<human's answer>) instead of fresh input.
  2. Read back graph.aget_state() — this works identically whether the run
     got there via ainvoke() or astream_events(), so both invoke and stream
     paths share _finish() for interrupt detection.
  3. Package the result into AgentResponse.metadata for
     LangGraphExecutionStep to translate into a StepResult (COMPLETE vs
     HITL, new messages, checkpoint blob, hitl actions).
"""
from __future__ import annotations

from typing import Any, AsyncIterator, Callable

from agent_sdk.agent_profile import AgentProfile
from agent_sdk.agent_runner.agent_runner import AgentRunner
from agent_sdk.caller_config import CallerConfig
from agent_sdk.hitl import HitlAction
from agent_sdk.langgraph.checkpoint import (
    build_config,
    new_checkpointer,
    restore_checkpointer,
    snapshot_checkpointer,
)
from agent_sdk.langgraph.messages import (
    default_input_adapter,
    default_new_messages_adapter,
    default_output_adapter,
)
from agent_sdk.messages import AnyMessage
from agent_sdk.types import AgentResponse, StreamChunk

# state_data keys this runner owns — namespaced to avoid clashing with
# developer-defined checkpoint_data keys.
CHECKPOINT_STATE_KEY = "_langgraph_checkpoint"
MSG_COUNT_STATE_KEY = "_langgraph_known_messages"

# Zero-arg callable returning an UNCOMPILED StateGraph. Typed as Any (not
# "StateGraph") so importing this module never requires langgraph installed.
GraphBuilder = Callable[[], Any]


def _require_langgraph() -> None:
    try:
        import langgraph  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "LangGraph is not installed. Install it with:\n"
            "  pip install langgraph\n"
            "Or add 'langgraph' to your agent's dependencies "
            "(pip install 'hope-agent-sdk[langgraph]')."
        ) from exc


def _json_safe(value: Any) -> Any:
    """Best-effort JSON-safe conversion for interrupt payloads (see HITL flow)."""
    import json

    try:
        json.dumps(value)
        return value
    except TypeError:
        return json.loads(json.dumps(value, default=str))


def _interrupt_to_hitl_action(intr: Any) -> dict[str, Any]:
    """
    Map a LangGraph Interrupt (id + arbitrary value from interrupt(...)) onto
    the platform's HitlAction shape (agent_sdk.hitl.HitlAction).

    Best-effort: interrupt() accepts any JSON-able payload, so this only
    special-cases the common convention of calling
    interrupt({"question": ..., "description": ..., "options": [...]}).
    Anything else falls back to a generic question with the raw value tucked
    into description so nothing is lost.
    """
    value = _json_safe(intr.value)
    if isinstance(value, dict) and "question" in value:
        return HitlAction(
            id=intr.id,
            question=str(value.get("question")),
            description=value.get("description"),
            options=value.get("options"),
        ).model_dump()
    return HitlAction(
        id=intr.id,
        question="Input required to continue",
        description=str(value),
    ).model_dump()


class LangGraphAgentRunner(AgentRunner):
    """
    AgentRunner backed by a LangGraph `StateGraph`.

    Args:
        graph_builder:        Zero-arg callable returning an UNCOMPILED
                               StateGraph. Called (and compiled) fresh on
                               every invoke — keep it cheap and side-effect
                               free, same rule as Agent factory functions.
        agent_profile:        AgentProfile (max_runs / system_prompt). If you
                               don't need those, create_langgraph_agent()
                               builds a minimal one for you.
        input_adapter:        list[AnyMessage] -> dict — builds the graph's
                               initial input state on the first run only.
                               Default assumes the MessagesState convention.
        output_adapter:       dict (final graph state) -> Any — builds
                               StepResult.output on completion.
        new_messages_adapter: (known_count, dict) -> list[AnyMessage] — the
                               messages the graph produced that the platform
                               hasn't recorded yet (appended to
                               context.messages by LangGraphExecutionStep).

    None of graph_builder / the adapters are called until the first
    invoke() — constructing or registering this runner never requires
    LangGraph or langchain-core to be installed; only running it does.
    """

    def __init__(
        self,
        graph_builder: GraphBuilder,
        agent_profile: "AgentProfile | None" = None,
        *,
        input_adapter: Callable[[list[AnyMessage]], dict[str, Any]] = default_input_adapter,
        output_adapter: Callable[[dict[str, Any]], Any] = default_output_adapter,
        new_messages_adapter: Callable[
            [int, dict[str, Any]], list[AnyMessage]
        ] = default_new_messages_adapter,
    ) -> None:
        profile = agent_profile or AgentProfile(agent_id="langgraph-agent")
        super().__init__(agent_profile=profile)
        self._graph_builder = graph_builder
        self._input_adapter = input_adapter
        self._output_adapter = output_adapter
        self._new_messages_adapter = new_messages_adapter

    @property
    def default_config(self) -> CallerConfig:
        """
        LangGraph agents don't route through our LlmConfig presets — the
        graph makes its own model calls internally. See class docstring.
        """
        return CallerConfig(resource_type="langgraph", resource_id=self.agent_profile.agent_id)

    # ------------------------------------------------------------------
    # Shared setup for both invoke and stream paths
    # ------------------------------------------------------------------

    def _compile(self, state_data: dict[str, Any]) -> tuple[Any, Any, bool]:
        """
        Build (graph, checkpointer, is_resume) for this run.

        is_resume=True  → a checkpoint blob already exists in state_data,
                          meaning this session interrupted at least once —
                          this run must use Command(resume=...).
        is_resume=False → first run for this session — fresh input.
        """
        _require_langgraph()
        blob = state_data.get(CHECKPOINT_STATE_KEY)
        if blob:
            checkpointer = restore_checkpointer(blob)
            is_resume = True
        else:
            checkpointer = new_checkpointer()
            is_resume = False
        graph = self._graph_builder().compile(checkpointer=checkpointer)
        return graph, checkpointer, is_resume

    @staticmethod
    def _resume_value(state_data: dict[str, Any]) -> Any:
        """
        Extract the human-provided resume value from checkpoint_data.

        Populated by LangGraphResumeCheck.resume_work() from the freshly
        loaded HITL actions (state.checkpoint_data["hitl_actions"]) on the
        way back into the execution loop — see
        agent_sdk.langgraph.resume_check.
        """
        from agent_sdk.langgraph.resume_check import RESUME_VALUE_KEY

        return state_data.get(RESUME_VALUE_KEY)

    async def _finish(
        self,
        graph: Any,
        checkpointer: Any,
        lg_config: dict[str, Any],
        state_data: dict[str, Any],
    ) -> AgentResponse:
        """
        Read back the post-run graph state and package everything
        LangGraphExecutionStep needs into an AgentResponse.metadata.
        Shared by both _do_invoke and _do_stream — aget_state() reflects the
        same checkpointed state regardless of how we got here.
        """
        snapshot = await graph.aget_state(lg_config)
        interrupted = bool(snapshot.interrupts)

        known_count = state_data.get(MSG_COUNT_STATE_KEY, 0)
        new_messages = self._new_messages_adapter(known_count, snapshot.values)
        total_known = len(snapshot.values.get("messages", []))

        metadata: dict[str, Any] = {
            "interrupted": interrupted,
            "new_messages": new_messages,
            MSG_COUNT_STATE_KEY: total_known,
        }

        if interrupted:
            metadata["interrupt_actions"] = [
                _interrupt_to_hitl_action(intr) for intr in snapshot.interrupts
            ]
            metadata[CHECKPOINT_STATE_KEY] = snapshot_checkpointer(checkpointer)
        else:
            metadata["output"] = self._output_adapter(snapshot.values)

        return AgentResponse(content=metadata.get("output"), metadata=metadata)

    def _build_input(self, state_data: dict[str, Any], is_resume: bool, messages: list[AnyMessage]) -> Any:
        if is_resume:
            from langgraph.types import Command

            return Command(resume=self._resume_value(state_data))
        return self._input_adapter(messages)

    # ------------------------------------------------------------------
    # AgentCaller contract
    # ------------------------------------------------------------------

    async def _do_invoke(
        self, config: CallerConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AgentResponse:
        state_data: dict[str, Any] = kwargs.get("state_data") or {}
        lg_config = build_config()
        graph, checkpointer, is_resume = self._compile(state_data)
        graph_input = self._build_input(state_data, is_resume, messages)

        await graph.ainvoke(graph_input, config=lg_config)
        return await self._finish(graph, checkpointer, lg_config, state_data)

    async def _do_stream(
        self, config: CallerConfig, messages: list[AnyMessage], **kwargs: Any
    ) -> AsyncIterator[StreamChunk]:
        state_data: dict[str, Any] = kwargs.get("state_data") or {}
        lg_config = build_config()
        graph, checkpointer, is_resume = self._compile(state_data)
        graph_input = self._build_input(state_data, is_resume, messages)

        async for event in graph.astream_events(graph_input, config=lg_config, version="v2"):
            if event.get("event") == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                delta = getattr(chunk, "content", "") if chunk is not None else ""
                delta_str = delta if isinstance(delta, str) else str(delta) if delta else ""
                if delta_str:
                    yield StreamChunk(content_delta=delta_str, is_final=False)

        response = await self._finish(graph, checkpointer, lg_config, state_data)
        yield StreamChunk(content_delta="", is_final=True, metadata=response.metadata)
