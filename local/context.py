"""
Context retrieval + compression for injection into local LLM / Haiku prompts.

Deliberately NOT embedding-based (see docs/AGENT_TOKEN_OPTIMIZATION.md — JEV
and other proprietary embedding models were explicitly rejected as not
open-source). Retrieval here is keyword/term-overlap scoring over two sources:

  - docs/*.md          — architecture and process documentation
  - local memory       — past checkpoints (decisions/reasoning) and work items

Compression defaults to deterministic truncation (cheap, ~0ms, no LLM round
trip). LLM-based summarization is opt-in for callers that want tighter
compression and can afford the latency (see llm_compress()).
"""

import re
from pathlib import Path
from typing import Optional

from memory import LocalMemory

DOCS_DIR = Path(__file__).parent.parent / "docs"

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is",
    "are", "with", "this", "that", "it", "be", "as", "by", "at",
}


def _tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 1]


def _score(query_tokens: list[str], text: str) -> float:
    """Term-overlap score: fraction of query tokens present, weighted by count."""
    if not query_tokens:
        return 0.0
    text_tokens = _tokenize(text)
    if not text_tokens:
        return 0.0
    text_counts: dict[str, int] = {}
    for t in text_tokens:
        text_counts[t] = text_counts.get(t, 0) + 1

    score = 0.0
    for qt in query_tokens:
        if qt in text_counts:
            # log-damped term frequency so one repeated word doesn't dominate
            score += 1 + (text_counts[qt] - 1) * 0.25
    return score / len(query_tokens)


class ContextHit:
    def __init__(self, source: str, label: str, text: str, score: float):
        self.source = source  # "doc" | "checkpoint" | "work_item"
        self.label = label  # e.g. filename, or "checkpoint#123"
        self.text = text
        self.score = score

    def __repr__(self):
        return f"ContextHit({self.source}, {self.label}, score={self.score:.2f})"


def search_docs(query: str, limit: int = 5) -> list[ContextHit]:
    """Keyword search across docs/*.md, scored by term overlap per paragraph."""
    query_tokens = _tokenize(query)
    hits: list[ContextHit] = []

    if not DOCS_DIR.exists():
        return hits

    for doc_path in DOCS_DIR.glob("*.md"):
        try:
            content = doc_path.read_text(encoding="utf-8")
        except Exception:
            continue

        # Score per paragraph (split on blank lines) so we return a relevant
        # excerpt, not an entire multi-thousand-word document.
        for para in content.split("\n\n"):
            para = para.strip()
            if len(para) < 20:
                continue
            score = _score(query_tokens, para)
            if score > 0:
                hits.append(ContextHit("doc", doc_path.name, para, score))

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]


def search_memory(query: str, limit: int = 5) -> list[ContextHit]:
    """Keyword search over local memory: checkpoints and work items."""
    query_tokens = _tokenize(query)
    hits: list[ContextHit] = []

    mem = LocalMemory()
    try:
        rows = mem.conn.execute(
            "SELECT id, agent_id, decision, reasoning FROM checkpoints ORDER BY timestamp DESC LIMIT 200"
        ).fetchall()
        for row in rows:
            text = f"{row['decision']} {row['reasoning'] or ''}"
            score = _score(query_tokens, text)
            if score > 0:
                hits.append(ContextHit("checkpoint", f"{row['agent_id']}#{row['id']}", text.strip(), score))

        items = mem.conn.execute(
            "SELECT id, title, lane FROM work_items ORDER BY updated_at DESC LIMIT 200"
        ).fetchall()
        for item in items:
            text = f"{item['title']} (lane: {item['lane']})"
            score = _score(query_tokens, text)
            if score > 0:
                hits.append(ContextHit("work_item", item["id"], text, score))
    finally:
        mem.close()

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]


def compress_snippet(text: str, max_chars: int = 300) -> str:
    """Deterministic truncation — the default, zero-latency compression."""
    text = " ".join(text.split())  # collapse whitespace
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rsplit(" ", 1)[0] + "…"


def llm_compress(text: str, max_tokens: int = 150) -> str:
    """
    Optional LLM-based summarization for tighter compression than truncation
    allows. Costs a local-model round trip (see docs/LOCAL_MODEL_GUIDE.md for
    typical latency) — use only when the caller can afford it.
    """
    from local_llm import query_local_llm, LocalLLMError

    prompt = f"Summarize the following in one or two sentences, keeping concrete details (names, IDs, numbers):\n\n{text}"
    try:
        result = query_local_llm(prompt, temperature=0.2, max_tokens=max_tokens)
        return result["text"]
    except LocalLLMError:
        # Fall back to deterministic truncation rather than failing the caller.
        return compress_snippet(text, max_chars=max_tokens * 4)


def build_context(
    query: str,
    budget_chars: int = 2000,
    use_llm: bool = False,
    doc_limit: int = 5,
    memory_limit: int = 5,
) -> str:
    """
    Assemble a ready-to-inject context block for `query`: retrieves the most
    relevant doc paragraphs and memory entries, compresses each, and packs
    them into `budget_chars` with source attribution.
    """
    doc_hits = search_docs(query, limit=doc_limit)
    memory_hits = search_memory(query, limit=memory_limit)

    all_hits = sorted(doc_hits + memory_hits, key=lambda h: h.score, reverse=True)

    per_snippet_budget = max(100, budget_chars // max(1, len(all_hits))) if all_hits else 0

    lines = []
    used = 0
    for hit in all_hits:
        compressed = (
            llm_compress(hit.text, max_tokens=per_snippet_budget // 4)
            if use_llm
            else compress_snippet(hit.text, max_chars=per_snippet_budget)
        )
        entry = f"[{hit.source}:{hit.label}] {compressed}"
        if used + len(entry) > budget_chars:
            break
        lines.append(entry)
        used += len(entry)

    if not lines:
        return "(no relevant context found)"

    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    query = " ".join(sys.argv[1:]) or "quality gates"
    print(build_context(query))
