"""
engine
~~~~~~
Engine package — core execution foundation (singleton).

Public API:
  - Engine (singleton, created by Runner)
  - ExecutionState, RunStatus, TriggerParams (types)
  - UsageRecord (DB schema type)
"""

from engine.engine import Engine
from engine.types import ExecutionState, RunStatus, TriggerParams, UsageRecord

__all__ = [
    "Engine",
    "ExecutionState",
    "RunStatus",
    "TriggerParams",
    "UsageRecord",
]
