"""
Task router: decides whether to use local LLM (fast, free) or Haiku (slow, paid).
Routes orchestration work to local, complex engineering to Haiku.
"""

from typing import Literal
from local_llm import classify_task_complexity


class TaskRouter:
    """Routes tasks to local LLM or Haiku based on complexity."""

    # Tasks that ALWAYS go to local LLM
    LOCAL_LLM_TASKS = {
        "status_check",
        "work_assignment",
        "metrics_collection",
        "checkpoint_logging",
        "agent_scheduling",
        "dependency_resolution",
        "memory_management",
        "test_validation",
    }

    # Tasks that ALWAYS go to Haiku
    HAIKU_TASKS = {
        "implement_feature",
        "code_review",
        "refactoring",
        "architecture_design",
        "bug_fix",
        "complex_testing",
        "performance_optimization",
    }

    @staticmethod
    def route(task_type: str, work_item: dict = None) -> Literal["local", "haiku"]:
        """
        Route a task to local LLM or Haiku.

        Args:
            task_type: Type of task (e.g., "implement_feature")
            work_item: Optional work item dict (contains title for classification)

        Returns:
            "local" or "haiku"
        """

        # Explicit routing takes precedence
        if task_type in TaskRouter.HAIKU_TASKS:
            return "haiku"

        if task_type in TaskRouter.LOCAL_LLM_TASKS:
            return "local"

        # If work_item provided, classify by title
        if work_item and "title" in work_item:
            return classify_task_complexity(work_item["title"])

        # Default: local for orchestration, haiku for engineering
        if task_type.startswith("get_") or task_type.startswith("list_"):
            return "local"  # Queries → local

        if task_type.startswith("update_") or task_type.startswith("set_"):
            return "local"  # State updates → local

        # Unknown tasks → local (safe default)
        return "local"

    @staticmethod
    def cost_estimate(task_type: str, tokens: int) -> dict:
        """
        Estimate cost and latency for a task.

        Returns:
            {"cost": float, "latency_ms": int, "model": str}
        """

        route = TaskRouter.route(task_type)

        if route == "local":
            return {
                "cost": 0.0,
                "latency_ms": 80,
                "tokens_in": tokens,
                "tokens_out": 0,
                "model": "qwen2.5-1.5b-instruct-mlx-local",
                "savings_vs_haiku": f"${tokens * 0.00015:.4f}",
            }
        else:  # haiku
            # Haiku: ~$0.00015 per 1K input tokens
            cost = (tokens / 1000) * 0.00015
            return {
                "cost": cost,
                "latency_ms": 1500,
                "tokens_in": tokens,
                "tokens_out": 0,
                "model": "claude-haiku-4-5",
                "savings_vs_haiku": "$0.00",
            }


def should_use_local_llm(task_type: str, work_item: dict = None) -> bool:
    """Helper: returns True if should use local LLM."""
    return TaskRouter.route(task_type, work_item) == "local"


def should_use_haiku(task_type: str, work_item: dict = None) -> bool:
    """Helper: returns True if should use Haiku."""
    return TaskRouter.route(task_type, work_item) == "haiku"


# Example routing decisions
ROUTING_EXAMPLES = {
    # Local LLM (free, fast)
    "status_check": {
        "route": "local",
        "reason": "Simple orchestration query",
        "cost": "$0.00",
        "latency_ms": 100,
    },
    "work_assignment": {
        "route": "local",
        "reason": "Routing decision based on agent capacity",
        "cost": "$0.00",
        "latency_ms": 150,
    },
    "metrics_collection": {
        "route": "local",
        "reason": "Aggregating local snapshots",
        "cost": "$0.00",
        "latency_ms": 50,
    },

    # Haiku (paid, best quality)
    "implement_feature": {
        "route": "haiku",
        "reason": "Complex code generation requires deep understanding",
        "cost": "$0.001-0.005",
        "latency_ms": 2000,
    },
    "code_review": {
        "route": "haiku",
        "reason": "Requires pattern matching and architectural knowledge",
        "cost": "$0.0005-0.001",
        "latency_ms": 1500,
    },
    "refactoring": {
        "route": "haiku",
        "reason": "Complex transformation needs semantic understanding",
        "cost": "$0.001-0.003",
        "latency_ms": 2000,
    },
}
