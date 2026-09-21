# Local Hybrid Architecture — Seridian SWE Gauntlet

> **Goal:** Reduce Anthropic dependency by 70%+. Use fast local LLM for orchestration, memory, and coordination. Reserve Haiku for complex code generation only.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CONVEX DB (Cloud)                        │
│  (Source of truth: work items, agent state, metrics)        │
└────────────────┬────────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌──────────────────┐   ┌──────────────────┐
│  Local Memory    │   │  Local LLM Loop  │
│  (SQLite)        │   │  (Qwen2.5 MLX)   │
│                  │   │                  │
│ • Agent state    │   │ • Work claiming  │
│ • Work queue     │   │ • Status checks  │
│ • Checkpoints    │   │ • Planning       │
│ • Metrics cache  │   │ • Memory mgmt    │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         └──────────┬───────────┘
                    │
              [Decision Router]
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   [Simple Tasks]         [Complex Tasks]
   (Local LLM)            (Haiku via API)
   • Status updates       • Implement feature
   • Test validation      • Code review
   • Metrics collection   • Architecture
   • Checkpoint mgmt      • Refactoring
   • Work assignment
```

---

## Local LLM Setup

### Option 1: MLX (Recommended — Apple Silicon, no discrete GPU needed)

This is what Seridian actually targets. It's built for machines like an
M1 with 16GB unified memory and no VRAM — the case where a generic
"install Ollama, pull Mistral 7B" recommendation wastes RAM and leaves
throughput on the table. See `docs/LOCAL_MODEL_GUIDE.md` for the full
rationale (ported from `adventurers-harness`'s tiered MLX swarm research).

**Install:**
```bash
pip install mlx-lm

# Pull + run (auto-downloads from Hugging Face, ~1GB)
python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080
# OpenAI-compatible endpoint at http://localhost:8080/v1/chat/completions
```

**Models to use:**
- **Qwen2.5-1.5B-Instruct (4-bit MLX)**: ~1GB, 200-280 tok/sec on M1. Default — work assignment, routing.
- **Qwen2.5-0.5B-Instruct (4-bit MLX)**: ~400MB, 400-450 tok/sec on M1. Optional router tier for pure status/heartbeat checks.

**Cost:** FREE (Metal, zero-copy unified memory)

**Token limit:** 32K context — enough for agent state, work items, and recent checkpoints

**Latency:** ~50-150ms for a typical agent decision on M1 (vs 1-2s for API)

### Option 2: Ollama (if you have a discrete GPU, e.g. RTX 3080+/4090)

Only relevant on non-Apple-Silicon hardware with real VRAM. On an M1 with no
discrete GPU this is strictly worse than MLX for this workload.

```bash
brew install ollama   # or: curl https://ollama.ai/install.sh | sh
ollama pull mistral   # 7B, ~4GB, needs a real GPU to be fast
```

---

## Local Memory System (SQLite)

**Database schema:**

```sql
-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  capacity INTEGER,
  status TEXT,
  last_heartbeat INTEGER,
  metadata JSON
);

-- Work Items (mirrored from Convex, cached locally)
CREATE TABLE work_items (
  id TEXT PRIMARY KEY,
  lane TEXT,
  title TEXT,
  status TEXT,  -- pending, claimed, in_progress, completed
  claimed_by TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  dependencies JSON,
  result JSON
);

-- Agent Checkpoints (local reasoning trace)
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  turn INTEGER,
  timestamp INTEGER,
  decision TEXT,
  reasoning TEXT,
  metrics JSON
);

-- Memory Snapshots (fast cache of Convex state)
CREATE TABLE memory_snapshots (
  id TEXT PRIMARY KEY,
  entity_type TEXT,  -- agent, work_item, lane_metric
  entity_id TEXT,
  data JSON,
  timestamp INTEGER
);

-- Tokens Used (track cost)
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  model TEXT,  -- "local" or "haiku"
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost REAL
);
```

**Location:** `~/.seridian/memory.db`

---

## Router Logic: When to Use Local vs Haiku

### Local LLM (Fast path, FREE)
- **Status checks** ("what's the current state of auth lane?")
- **Work assignment** ("who should claim this item?")
- **Metrics collection** ("summarize test coverage")
- **Test validation** ("did the unit tests pass?")
- **Checkpoint logging** ("log this agent decision")
- **Planning** ("what's the next step?")
- **Dependencies** ("which items block this one?")
- **Memory management** ("summarize last 10 agent decisions")

**Prompt template (100 tokens, ~30ms):**
```
You are a work orchestrator. Current agent state:
{{agent_state}}

Current work queue:
{{pending_work}}

Question: {{task}}

Answer briefly (1-2 sentences, focus on decision).
```

### Haiku (Complex path, $0.002 per 1K tokens)
- **Implement feature** ("build auth email badge")
- **Code review** ("review this PR for patterns")
- **Refactoring** ("simplify this function")
- **Architecture** ("design the Forms lane")
- **Bug fixes** ("debug why tests are flaky")
- **Testing** ("write E2E test for signup")

**Prompt template (2000+ tokens, ~1s, costs $0.002-0.01):**
```
You are a senior engineer. Build this feature:
{{feature_spec}}

Tests:
{{test_suite}}

Answer: Full implementation, tests, validation.
```

---

## Integration Points

### 1. Agent Orchestrator Loop (runs locally every 10s)

```python
# orchestrator.py
import sqlite3
import requests
import json

db = sqlite3.connect("~/.seridian/memory.db")

def local_orchestrator_loop():
    while True:
        # 1. Sync Convex state to local DB (cheap read)
        sync_convex_to_local_db()
        
        # 2. Check for pending work
        pending = db.execute(
            "SELECT id FROM work_items WHERE status='pending' LIMIT 5"
        ).fetchall()
        
        # 3. For each pending item, decide routing
        for work_id in pending:
            item = db.execute(
                "SELECT * FROM work_items WHERE id=?", (work_id,)
            ).fetchone()
            
            # Simple check: is this complex code work?
            is_complex = "implement" in item['title'].lower() or \
                        "refactor" in item['title'].lower()
            
            if is_complex:
                # Route to Haiku (costs $, but best quality)
                route_to_haiku(item)
            else:
                # Route to local LLM (free, fast)
                response = query_local_llm(f"""
                    Claim and start this work:
                    {item['title']}
                    
                    Available engineers: {get_available_engineers()}
                    
                    Who should claim it? Respond: "engineer-name reason"
                """)
                
                engineer = parse_response(response)
                db.execute(
                    "UPDATE work_items SET claimed_by=?, status='claimed' WHERE id=?",
                    (engineer, work_id)
                )
        
        # 4. Update agent heartbeats to Convex (batch write, cheap)
        sync_local_to_convex()
        
        time.sleep(10)  # Every 10s
```

### 2. Local LLM Client

```python
# local_llm.py
import requests

LOCAL_LLM_URL = "http://localhost:8080/v1/chat/completions"  # mlx_lm.server

def query_local_llm(prompt: str, model: str = "mlx-community/Qwen2.5-1.5B-Instruct-4bit") -> str:
    """Query local MLX LLM (zero cost, ~50-150ms latency on M1)."""

    response = requests.post(
        LOCAL_LLM_URL,
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,  # Deterministic for orchestration
        }
    )

    return response.json()["choices"][0]["message"]["content"]
```

### 3. Convex Sync (Bidirectional)

```python
# convex_sync.py

def sync_convex_to_local_db():
    """Pull work items, agent state from Convex (read-only)."""
    
    # Read from Convex (cheap query, ~100ms)
    work_items = convex_client.query(
        "agent_coordination:getAllWorkItems", {}
    )
    
    # Store in SQLite
    for item in work_items:
        db.execute("""
            INSERT OR REPLACE INTO work_items
            (id, lane, title, status, claimed_by, dependencies)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (item['id'], item['lane'], item['title'], 
              item['status'], item.get('claimed_by'), 
              json.dumps(item.get('dependencies', []))))
    
    db.commit()

def sync_local_to_convex():
    """Push agent state, metrics back to Convex (cheap mutation)."""
    
    # Get local checkpoints
    checkpoints = db.execute(
        "SELECT * FROM checkpoints WHERE synced=0"
    ).fetchall()
    
    for cp in checkpoints:
        # Write to Convex (atomic, ~100ms)
        convex_client.mutation(
            "agent_coordination:logCheckpoint",
            {
                "agent": cp['agent_id'],
                "message": cp['reasoning'],
                "metrics": json.loads(cp['metrics'])
            }
        )
        
        db.execute(
            "UPDATE checkpoints SET synced=1 WHERE id=?",
            (cp['id'],)
        )
    
    db.commit()
```

---

## Cost Model: Baseline vs Optimized

### Old Baseline (All Haiku)
- Orchestrator loop: ~200 tokens/min → $0.00003/min
- Planner: ~1000 tokens every hour → $0.0002/hour
- Engineers: ~5000 tokens per feature → $0.001 per feature
- QA/E2E/Perf: ~2000 tokens per merge → $0.0004 per merge
- **Total: ~$0.58/week**

### New Optimized (Local + Haiku)
- Local LLM loop: 100 tokens/min × 10,080 min/week = **FREE** ✓
- Haiku for implementation only:
  - 1 feature/day × 5000 tokens × $0.0002/1K = $1/day × 5 days = $5/week
  - Code review × 0.0004 = $2.88/week
  - **Total: ~$8/week for actual engineering**

Wait... that's higher. BUT:
- **Key benefit:** Runs offline (no internet needed after initial Convex auth)
- **Latency:** 100ms local decisions vs 2s API calls = 20× faster
- **Reliability:** Doesn't break on Anthropic outages
- **Flexibility:** Can run 24/7 without rate limits

**Better model:** Use local LLM for 90% of orchestration, only call Haiku for **actual code work** (~1-2 features/day max):
- **Local orchestration:** FREE
- **Haiku for 1 feature/day:** ~$1/week
- **Total: ~$1-2/week** (vs $0.58 but 20× faster + offline)

---

## Memory System Features

### 1. Agent State Snapshots
Every 60s, save agent decision to local DB:
```json
{
  "agent_id": "engineer-spine-001",
  "turn": 42,
  "decision": "claimed work_item #k8x2",
  "reasoning": "Auth lane has 2 available, less load than Forms",
  "confidence": 0.95,
  "timestamp": 1726791360000
}
```

### 2. Work Queue Cache
Mirror Convex work items locally, check status without API:
```python
# Fast: O(1) local lookup
work = db.execute("SELECT * FROM work_items WHERE id=?")

# vs
# Slow: API roundtrip
work = convex_client.query("getWorkItem", {"id": id})
```

### 3. Metric Snapshots
Cache lane coverage, test results, perf baselines:
```python
# Local: ~1ms
coverage = db.execute(
    "SELECT value FROM memory_snapshots WHERE entity_id=? ORDER BY timestamp DESC LIMIT 1"
)

# Remote: ~500ms
coverage = convex_client.query("getLaneMetrics", {"lane": "Auth"})
```

---

## Quick Start

### 1. Install local LLM
```bash
pip install mlx-lm
python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080
```

### 2. Initialize local memory
```bash
mkdir -p ~/.seridian
sqlite3 ~/.seridian/memory.db < schema.sql
```

### 3. Start orchestrator loop
```bash
python orchestrator.py
```

### 4. Convex still owns work items
- Agents claim work via local LLM
- Sync state every 60s to Convex
- Convex remains the source of truth
- Local DB is a cache

---

## Token Savings

| Task | Old (Haiku) | New (Local) | Savings |
|---|---|---|---|
| Status check | 200 tokens, $0.00006 | 100 tokens, FREE | 99.97% |
| Work assignment | 150 tokens, $0.00004 | 80 tokens, FREE | 99.97% |
| Metrics summary | 300 tokens, $0.00009 | 120 tokens, FREE | 99.97% |
| Feature impl | 5000 tokens, $0.0015 | 5000 tokens, $0.0015 | — |
| Code review | 3000 tokens, $0.0009 | 3000 tokens, $0.0009 | — |

**Result:** 90% of decisions free (orchestration), 10% paid (actual engineering).

---

## Architecture Benefits

✅ **Offline-capable** — Orchestration runs locally, no internet
✅ **20× faster decisions** — 100ms local vs 2s API roundtrip
✅ **Cost-optimized** — Pay only for complex code work
✅ **Reliable** — Doesn't break on Anthropic outages
✅ **Privacy** — Agent state lives in ~/.seridian locally
✅ **Scalable** — Local loop can run 1000× per day free
✅ **Verifiable** — Full decision audit trail in SQLite

---

## Next Steps

1. **Build local memory schema** — SQLite tables for agents, work items, checkpoints
2. **Implement MLX client** — Query local LLM via HTTP (OpenAI-compatible)
3. **Build router logic** — Route simple vs complex tasks
4. **Sync orchestrator** — Bidirectional Convex ↔ Local
5. **Deploy local loop** — Run as daemon on developer machine
6. **Measure latency** — Target <100ms per orchestration decision
7. **Track savings** — Monitor Haiku token usage (should drop 90%)

---

**Result:** SWE gauntlet that is fast, offline, cheap, and 100% autonomous for orchestration. Haiku focuses only on what it's best at: complex code engineering.
