from typing import Literal, NotRequired, TypedDict

from agent_sdk.langgraph import LangGraphAgent
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from litellm import completion


class State(TypedDict):
    request: NotRequired[str]
    decision: NotRequired[str]
    response: NotRequired[str]


OPTIONS = ["approve", "reject"]


def human_review(state: State):
    request = state.get("request")

    if request is None:
        raise ValueError(
            f"'request' is missing from the graph state. Received state: {state}"
        )

    decision = interrupt(
        {
            "question": "Approve this request?",
            "draft": request,
            "options": OPTIONS,
        }
    )

    return {"decision": decision}


def route_decision(state: State) -> Literal["llm_call", "rejected"]:
    return "llm_call" if state["decision"] == "approve" else "rejected"


def llm_call(state: State):
    request = state.get("request")

    if request is None:
        raise ValueError("request missing from state")

    resp = completion(
        model="fireworks_ai/accounts/fireworks/models/deepseek-v4-flash",
        messages=[
            {
                "role": "user",
                "content": request,
            }
        ],
    )

    return {
        "response": resp.choices[0].message.content,
    }


def rejected(state: State):
    return {
        "response": "Request rejected",
    }


def build_graph():
    graph = StateGraph(State)

    graph.add_node("human_review", human_review)
    graph.add_node("llm_call", llm_call)
    graph.add_node("rejected", rejected)

    graph.add_edge(START, "human_review")

    graph.add_conditional_edges(
        "human_review",
        route_decision,
        {
            "llm_call": "llm_call",
            "rejected": "rejected",
        },
    )

    graph.add_edge("llm_call", END)
    graph.add_edge("rejected", END)

    return graph


def my_agent_factory(agent_id: str) -> LangGraphAgent:
    return LangGraphAgent.create(
        agent_id=agent_id,
        graph_builder=build_graph,
        max_runs=10,
    )
