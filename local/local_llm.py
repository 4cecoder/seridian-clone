"""
Local LLM client for fast, free orchestration decisions.
Connects to an MLX server (mlx_lm.server) running on Apple Silicon unified memory.

Why MLX instead of Ollama/Mistral: on Apple Silicon (M1-M5) with no discrete GPU,
MLX allocates zero-copy directly into unified RAM and small instruction-tuned models
(Qwen2.5-0.5B/1.5B) outperform a generic 7B Ollama model for structured orchestration
decisions (routing, work assignment) while using a fraction of the RAM. See
docs/LOCAL_MODEL_GUIDE.md for the full rationale (ported from adventurers-harness
research on tiered MLX swarms).

Start the server with:
    python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080
"""

import os
import requests
import time

LOCAL_LLM_URL = os.environ.get(
    "SERIDIAN_LOCAL_LLM_URL", "http://localhost:8080/v1/chat/completions"
)
DEFAULT_MODEL = os.environ.get(
    "SERIDIAN_LOCAL_MODEL", "mlx-community/Qwen2.5-1.5B-Instruct-4bit"
)
HEALTH_URL = LOCAL_LLM_URL.rsplit("/v1/", 1)[0] + "/v1/models"
TIMEOUT = 30


class LocalLLMError(Exception):
    pass


def check_ollama_health() -> bool:
    """
    Check if the local MLX server is running and accessible.
    (Named check_ollama_health for backwards compatibility with existing callers;
    it now checks the MLX server, not Ollama.)
    """
    try:
        response = requests.get(HEALTH_URL, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Local MLX server not running: {e}")
        print(
            "   Start it: python -m mlx_lm.server "
            f"--model {DEFAULT_MODEL} --port 8080"
        )
        return False


def query_local_llm(
    prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.3,
    max_tokens: int = 500,
) -> dict:
    """
    Query local MLX model (zero cost, ~50-150ms latency on M1 for these sizes).

    Args:
        prompt: The prompt to send
        model: MLX model repo id (default: Qwen2.5-1.5B-Instruct-4bit)
        temperature: 0.0-1.0 (lower = deterministic, higher = creative)
        max_tokens: Max response length

    Returns:
        Dict with text, elapsed_ms, model, tokens_out, tokens_in

    Raises:
        LocalLLMError: If the MLX server is not running or request fails
    """

    if not check_ollama_health():
        raise LocalLLMError(
            f"MLX server not running. Start with: python -m mlx_lm.server --model {model} --port 8080"
        )

    try:
        start_time = time.time()

        response = requests.post(
            LOCAL_LLM_URL,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            },
            timeout=TIMEOUT,
        )

        elapsed = time.time() - start_time

        if response.status_code != 200:
            raise LocalLLMError(
                f"MLX server error {response.status_code}: {response.text}"
            )

        result = response.json()
        choice = result.get("choices", [{}])[0]
        text = choice.get("message", {}).get("content", "").strip()
        usage = result.get("usage", {})

        return {
            "text": text,
            "elapsed_ms": int(elapsed * 1000),
            "model": model,
            "tokens_out": usage.get("completion_tokens", 0),
            "tokens_in": usage.get("prompt_tokens", 0),
        }

    except requests.Timeout:
        raise LocalLLMError(f"MLX server timeout after {TIMEOUT}s")
    except LocalLLMError:
        raise
    except Exception as e:
        raise LocalLLMError(f"Failed to query MLX server: {e}")


def summarize_agent_state(agent_state: dict) -> str:
    """Summarize agent state for efficient context."""
    return f"""
Agent: {agent_state.get('name')}
Role: {agent_state.get('role')}
Status: {agent_state.get('status')}
Capacity: {agent_state.get('capacity')}
Last heartbeat: {agent_state.get('last_heartbeat')}
"""


def decide_work_assignment(
    work_items: list,
    available_agents: list,
    lane_priorities: dict,
) -> dict:
    """
    Use local LLM to decide which agent should claim which work.

    Args:
        work_items: List of unclaimed work items
        available_agents: List of agents with free capacity
        lane_priorities: Dict mapping lane -> priority score

    Returns:
        Dict mapping work_id -> agent_id. Built via typesafe.choice() — one
        typed decision per work item, constrained to the real agent ID list,
        so a hallucinated ID is structurally impossible (not just filtered
        after the fact, as the earlier free-text-parsing version did).
    """
    import time as _time
    from typesafe import choice as _choice

    if not available_agents:
        return {"assignments": {}, "elapsed_ms": 0, "model": DEFAULT_MODEL}

    agent_ids = [agent["id"] for agent in available_agents]
    agent_context = "\n".join(
        f"  {agent['id']} (capacity: {agent['capacity']}, current load: {agent.get('load', 0)})"
        for agent in available_agents
    )

    start = _time.time()
    assignments: dict[str, str] = {}

    try:
        for item in work_items[:5]:
            question = f"Which engineer should claim this work item: [{item['id']}] {item['title']}?"
            context = (
                f"Lane: {item['lane']}, priority: {lane_priorities.get(item['lane'], 'medium')}\n"
                f"Available engineers:\n{agent_context}\n"
                f"Prefer an engineer whose lane matches this item's lane, then lowest current load."
            )
            result = _choice(question, agent_ids, context=context)
            if not result.hallucinated and result.confidence > 0.0:
                assignments[item["id"]] = result.choice

        return {
            "assignments": assignments,
            "elapsed_ms": int((_time.time() - start) * 1000),
            "model": DEFAULT_MODEL,
        }
    except LocalLLMError as e:
        print(f"⚠️  Local LLM unavailable, falling back to round-robin: {e}")
        assignments = {}
        for i, item in enumerate(work_items):
            agent = available_agents[i % len(available_agents)]
            assignments[item["id"]] = agent["id"]
        return {"assignments": assignments, "fallback": True}


def classify_task_complexity(title: str) -> str:
    """
    Classify whether a task should go to local LLM or Haiku.
    Uses simple heuristics (no LLM call).

    Returns: "local" or "haiku"
    """

    title_lower = title.lower()

    haiku_keywords = [
        "implement",
        "refactor",
        "architect",
        "design",
        "rewrite",
        "optimize",
        "refactoring",
        "code review",
        "review code",
    ]

    if any(kw in title_lower for kw in haiku_keywords):
        return "haiku"

    return "local"
