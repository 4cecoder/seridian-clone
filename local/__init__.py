"""
Local hybrid architecture for Seridian SWE gauntlet.
Fast, offline orchestration using local LLM + Haiku for complex code.
"""

from .memory import LocalMemory
from .local_llm import query_local_llm, classify_task_complexity
from .router import TaskRouter, should_use_local_llm, should_use_haiku

__all__ = [
    "LocalMemory",
    "query_local_llm",
    "classify_task_complexity",
    "TaskRouter",
    "should_use_local_llm",
    "should_use_haiku",
]
