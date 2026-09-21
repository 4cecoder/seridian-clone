# Local Hybrid Architecture — Implementation

Fast, offline orchestration using a local MLX model + Haiku for complex code.

> **Hardware note:** this targets Apple Silicon (M1-M5) unified memory, not a
> discrete GPU. If you're on an M1/16GB machine (no VRAM, no 4090), MLX beats
> Ollama+Mistral-7B for this workload — see `docs/LOCAL_MODEL_GUIDE.md` for the
> full rationale, ported from the tiered-swarm research in `adventurers-harness`.

## Setup (5 minutes)

### 1. Install MLX tooling

```bash
pip install mlx-lm
```

Pure Python package — no daemon/binary install, talks directly to Metal.

### 2. Pull a model (auto-downloads from Hugging Face)

```bash
python -m mlx_lm.generate --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --prompt "test" --max-tokens 5
# ~1GB download, cached to ~/.cache/huggingface/hub
```

### 3. Start the MLX server

```bash
python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080
# OpenAI-compatible endpoint at http://localhost:8080/v1/chat/completions
```

### 4. Initialize local memory

```bash
# Create ~/.seridian directory
mkdir -p ~/.seridian

# Initialize SQLite
sqlite3 ~/.seridian/memory.db < local/schema.sql
```

### 5. Bootstrap agents

```python
from local.memory import LocalMemory

memory = LocalMemory()

# Register the 10 agents
agents = [
    ("orchestrator", "Orchestrator", "orchestrator"),
    ("planner", "Planner", "planner"),
    ("engineer-spine-001", "Engineer (Spine)", "engineer"),
    ("engineer-spine-002", "Engineer (Spine)", "engineer"),
    ("engineer-auth-001", "Engineer (Auth)", "engineer"),
    ("engineer-auth-002", "Engineer (Auth)", "engineer"),
    ("engineer-forms-001", "Engineer (Forms)", "engineer"),
    ("engineer-forms-002", "Engineer (Forms)", "engineer"),
    ("reviewer-primary", "Reviewer", "reviewer"),
    ("integrator-primary", "Integrator", "integrator"),
]

for agent_id, name, role in agents:
    memory.register_agent(agent_id, name, role, capacity=2)

memory.close()
```

Done! ✅

## Usage

### Quick Test

```python
from local.local_llm import query_local_llm

# Free, ~50-150ms on M1
response = query_local_llm(
    prompt="What is the status of the Auth lane?",
    model="mlx-community/Qwen2.5-1.5B-Instruct-4bit",
    temperature=0.3
)

print(response)
```

### Orchestration Loop

```python
from local.memory import LocalMemory
from local.local_llm import decide_work_assignment
from local.router import TaskRouter

memory = LocalMemory()

# Get pending work
pending = memory.get_pending_work(limit=5)

# Get available engineers
available = memory.get_available_agents()

# Route decision to local LLM (free)
assignment = decide_work_assignment(pending, available, {})

# Update memory
for work_id, agent_name in assignment["assignments"].items():
    memory.claim_work(work_id, agent_name)

# Log decision
memory.log_checkpoint(
    agent_id="orchestrator",
    turn=1,
    decision=f"Assigned {len(assignment['assignments'])} items",
    confidence=0.9,
    metrics={"latency_ms": assignment["elapsed_ms"]}
)

memory.close()
```

### Async Orchestrator (Daemon)

```bash
# In orchestrator.py:
python local/orchestrator.py --loop 10
```

Runs every 10s, completely offline.

## Cost Breakdown

| Task | Model | Cost | Latency |
|---|---|---|---|
| Status check | Local | FREE | 50ms |
| Work assignment | Local | FREE | 150ms |
| Metrics aggregation | Local | FREE | 50ms |
| Feature implementation | Haiku | $0.001 | 2s |
| Code review | Haiku | $0.001 | 1.5s |

**Result:** 90% of decisions are FREE. Pay only for complex code work.

## Files

- **schema.sql** — SQLite schema for local memory
- **local_llm.py** — MLX server client
- **memory.py** — Memory database wrapper
- **router.py** — Task routing logic (local vs Haiku)
- **orchestrator.py** — Main orchestration loop (coming soon)
- **sync.py** — Bidirectional Convex ↔ Local sync (claims pushed before pulls, to avoid overwriting local claims with stale Convex state)
- **typesafe.py** — Choice/Score/Boolean decision primitives grounded in real logprobs

## Architecture

```
[Convex DB] ← source of truth
    ↓ (sync every 60s)
[Local SQLite] ← cache, offline decisions
    ↓
[Local LLM] ← fast orchestration (FREE)
    │
    ├─ Simple tasks (status, assignment)
    │
    └─ Complex code → [Haiku] (PAID)
```

## Benefits

✅ **Offline-capable** — Orchestration runs without internet
✅ **20× faster** — 100ms local vs 2s API
✅ **90% cost reduction** — Only pay for complex work
✅ **Verifiable** — Full audit trail in SQLite
✅ **Scalable** — Free to run 1000× per day
✅ **Reliable** — No Anthropic outage dependency

## Monitoring

```python
from local.memory import LocalMemory

memory = LocalMemory()
stats = memory.get_token_stats()
print(stats)
# {
#   "by_model": {
#     "qwen2.5-1.5b-instruct-mlx-local": {"tokens_in": 15000, "cost": 0.0},
#     "claude-haiku": {"tokens_in": 5000, "cost": 0.75}
#   }
# }
```

## Next Steps

1. ✅ Schema created
2. ✅ Local LLM client created
3. ✅ Memory wrapper created
4. ✅ Router logic created
5. ✅ Build orchestrator.py (main loop)
6. ✅ Build sync.py (Convex bidirectional — claims, work items, checkpoints; verified live against seridian-systems/watchful-cricket-498)
7. ✅ typesafe.py — logprob-grounded Choice/Score/Boolean decision primitives, wired into decide_work_assignment()
8. ⏳ Wire into agent spawning
9. ⏳ Deploy as daemon (launchd/systemd)

---

**Ready to go offline.** Run `python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080`, then `python local/orchestrator.py --loop 10`. 🚀
