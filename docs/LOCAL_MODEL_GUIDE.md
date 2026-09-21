# Local Model Guide — Seridian SWE Gauntlet

> **Goal:** Choose the right local model for fast, free orchestration on **your actual hardware** (Apple M1, 16GB unified memory, no discrete GPU).
>
> This replaces the earlier Ollama/Mistral-7B/Mixtral recommendation, which assumed a discrete GPU (RTX 4090) you don't have. Your own research in `adventurers-harness` already solved this exact problem — this guide ports that approach into Seridian's Python orchestration layer.

---

## Why the earlier recommendation was wrong

M1 has **no VRAM** — it has 16GB of **unified memory** shared between CPU, GPU (Metal), and the Neural Engine. Mistral 7B (Q4, ~4GB) *would* run, but:
- Ollama's llama.cpp backend on Apple Silicon leaves real perf on the table vs. Apple's own **MLX** framework, which allocates zero-copy directly into unified RAM.
- Seridian's orchestration tasks (work assignment, status checks, routing) are simple, structured decisions — they don't need a 7B model. They need to be **fast, tiny, and free**, leaving RAM for the actual dev environment (Convex dev server, editor, Chrome, etc).
- A 4090 doesn't exist on this machine, so the Mixtral tier was dead weight in the doc.

Your `adventurers-harness` research (`docs/mlx-unified-memory-optimization.md`) already proved a tiered MLX swarm fits in **~5.6GB total** on an 8GB base M-series machine, running a 45M-parameter router at 960+ tok/s and a 1B-class decomposer at 280+ tok/s — an order of magnitude lighter than Mistral 7B, with better throughput. That's the model to follow here.

---

## TL;DR — What to actually install

| Tier | Model | Quant | RAM | Speed (M1) | Role in Seridian |
|---|---|---|---|---|---|
| **Router** | Qwen2.5-0.5B-Instruct | 4-bit MLX | ~400MB | 400-450 tok/s | Status checks, heartbeats, local/Haiku routing |
| **Decomposer** | Qwen2.5-1.5B-Instruct | 4-bit MLX | ~1.0GB | 200-280 tok/s | Work assignment, dependency reasoning |

Total footprint: **~1.5GB unified RAM** — leaves 14.5GB free on this machine for everything else. No Ollama, no Mistral, no GPU requirement.

---

## Setup (5 minutes, M1/M-series only)

### 1. Install MLX tooling

```bash
pip install mlx-lm
```

No Homebrew daemon, no separate binary — it's a Python package that talks directly to Metal via MLX.

### 2. Pull the two models (auto-downloads from Hugging Face on first run)

```bash
# Router (tiny, fast-path)
python -m mlx_lm.generate --model mlx-community/Qwen2.5-0.5B-Instruct-4bit --prompt "test" --max-tokens 5

# Decomposer (work assignment reasoning)
python -m mlx_lm.generate --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --prompt "test" --max-tokens 5
```

This caches both models to `~/.cache/huggingface/hub` (~1.4GB combined download).

### 3. Start the MLX server (OpenAI-compatible endpoint)

```bash
python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080
```

This exposes `http://localhost:8080/v1/chat/completions` — same shape as OpenAI's API, which is what `local/local_llm.py` now targets (see below). Run the 0.5B router model on a second port (`8081`) only if you want the two-tier split; a single 1.5B instance is plenty for Seridian's orchestration volume and keeps setup to one process.

### 4. Point Seridian at it

```bash
export SERIDIAN_LOCAL_LLM_URL=http://localhost:8080/v1/chat/completions
export SERIDIAN_LOCAL_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
```

Done. `local/orchestrator.py --loop 10` will now use MLX instead of Ollama.

---

## Why Qwen2.5-0.5B/1.5B instead of Mistral 7B

| | Mistral 7B (old rec) | Qwen2.5-1.5B-Instruct (new rec) |
|---|---|---|
| Quantized size | ~4GB | ~1GB |
| Speed on M1 | ~15-20 tok/s (llama.cpp/Metal) | ~200-280 tok/s (MLX, per your harness benchmarks) |
| Context | 32K | 32K |
| Fit for task | Overkill — 7B general chat model for structured routing decisions | Right-sized — instruction-tuned small model, matches "Decomposer" tier role in your own harness |
| RAM headroom left (16GB machine) | ~11GB | ~15GB |

Seridian's orchestrator never needs open-ended reasoning from the local model — it needs "given this list of pending work and available agents, output an assignment." That's exactly the deterministic-decomposition job your harness already assigns to a 1B-class model, not a 7B one.

---

## If you later get a machine with more unified memory (M3/M4 Max, 36GB+)

You can scale up within the same MLX approach — no need to switch back to Ollama/Mistral:

| Machine | Upgrade path | Notes |
|---|---|---|
| M1/M2, 16GB (this machine) | Qwen2.5-1.5B-Instruct-4bit | Current recommendation |
| M3/M4 Pro, 24-36GB | Qwen2.5-7B-Instruct-4bit (~4.5GB) | More headroom for richer routing prompts |
| M3/M4 Max/Ultra, 64GB+ | Add a 1-bit quantized 20B+ reasoning tier (per your Bonsai 27B research) for genuinely hard planning decisions, still local | Only relevant if orchestration logic gets meaningfully harder |

There is still no scenario where Seridian's orchestration needs an RTX 4090 — that tier only made sense for the *engineering* workload, and that's already handled by Haiku over the API, not local inference.

---

## Troubleshooting

### Q: `mlx-lm` fails to install / import error
**A:** MLX requires Apple Silicon (M1+) and Python 3.9+. Confirm with:
```bash
python -c "import platform; print(platform.processor())"
# should print "arm"
```

### Q: Model download is slow
**A:** First run downloads from Hugging Face (~350MB for 0.5B, ~1GB for 1.5B). Subsequent runs are instant (cached).

### Q: Server responds slowly (>1s per decision)
**A:** Check nothing else is holding the GPU (Metal is shared — heavy Chrome/Xcode usage competes for bandwidth). Check with Activity Monitor → GPU History.

### Q: Want to compare against the Ollama baseline
**A:** Both can coexist. Keep Ollama installed if you like, but Seridian's `local/local_llm.py` targets the MLX server by default now — see `SERIDIAN_LOCAL_LLM_URL` above to switch back if needed.

---

## Summary

```
Model                          RAM     Speed        Cost   Rec?
────────────────────────────────────────────────────────────────
Qwen2.5-0.5B-Instruct (MLX)   ~400MB  400-450 t/s  FREE   ✅ Router/status tier
Qwen2.5-1.5B-Instruct (MLX)   ~1.0GB  200-280 t/s  FREE   ✅ Default — work assignment
Mistral 7B (Ollama)           ~4GB    15-20 t/s    FREE   ❌ Wrong tool for this hardware/task
Mixtral 8x7B                  ~50GB   50+ t/s      FREE   ❌ Needs a GPU this machine doesn't have
```

**Bottom line:** Your own `adventurers-harness` research already answered this — small MLX models on Apple Silicon unified memory beat a generic 7B Ollama model for structured orchestration, both in speed and in RAM you get to keep for everything else.
