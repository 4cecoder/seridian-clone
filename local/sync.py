"""
Bidirectional sync between local SQLite memory and Convex (source of truth).

Uses Convex's plain HTTP API (POST {url}/api/query and /api/mutation with
{"path": "module:function", "args": {...}, "format": "json"}) rather than a
Convex SDK — there's no official Python client, and this is a thin, stable,
documented surface that doesn't need one.

Two directions:
  - pull: Convex pending work items -> local SQLite cache (so the orchestrator
    can claim/assign work even if it briefly loses connectivity)
  - push: local unsynced checkpoints -> Convex (the durable audit trail)

Both directions are designed to be safe to call repeatedly (idempotent) and to
degrade gracefully (log + skip) rather than crash the orchestrator loop if
Convex is briefly unreachable.
"""

import os
import time
from typing import Optional

import requests

from memory import LocalMemory

TIMEOUT = 10


def _read_env_local() -> Optional[str]:
    """Fall back to reading .env.local directly if the var isn't exported —
    convenient for running sync.py standalone outside `bunx convex dev`."""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if not os.path.exists(env_path):
        return None
    with open(env_path) as f:
        for line in f:
            if line.startswith("NEXT_PUBLIC_CONVEX_URL="):
                return line.split("=", 1)[1].strip()
    return None


CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL") or _read_env_local()


class SyncError(Exception):
    pass


def _convex_query(path: str, args: Optional[dict] = None) -> dict:
    if not CONVEX_URL:
        raise SyncError("NEXT_PUBLIC_CONVEX_URL not set and not found in .env.local")
    response = requests.post(
        f"{CONVEX_URL}/api/query",
        json={"path": path, "args": args or {}, "format": "json"},
        timeout=TIMEOUT,
    )
    return _unwrap(response)


def _convex_mutation(path: str, args: Optional[dict] = None) -> dict:
    if not CONVEX_URL:
        raise SyncError("NEXT_PUBLIC_CONVEX_URL not set and not found in .env.local")
    response = requests.post(
        f"{CONVEX_URL}/api/mutation",
        json={"path": path, "args": args or {}, "format": "json"},
        timeout=TIMEOUT,
    )
    return _unwrap(response)


def _unwrap(response: requests.Response) -> dict:
    if response.status_code != 200:
        raise SyncError(f"Convex HTTP {response.status_code}: {response.text}")
    body = response.json()
    if body.get("status") != "success":
        raise SyncError(f"Convex error: {body.get('errorMessage', body)}")
    return body["value"]


def pull_pending_work(mem: LocalMemory, limit: int = 20) -> int:
    """
    Pull pending work items from Convex into the local SQLite cache.
    Returns the number of items pulled. Safe to call repeatedly — uses
    INSERT OR REPLACE semantics via LocalMemory.add_work_item().
    """
    try:
        items = _convex_query("agent_coordination:getPendingWork", {"limit": limit})
    except (SyncError, requests.RequestException) as e:
        print(f"⚠️  Convex pull failed (continuing offline): {e}")
        return 0

    for item in items:
        mem.add_work_item({
            "id": item["_id"],
            "lane": item.get("lane") or "unknown",
            "title": item["title"],
            "status": item["status"],
            "claimed_by": item.get("claimedBy"),
            "priority": item.get("priority", "medium"),
            "created_at": item.get("createdAt"),
            "dependencies": item.get("dependencies", []),
        })

    return len(items)


def push_claims(mem: LocalMemory) -> int:
    """
    Push locally-claimed work items to Convex. Without this, Convex's own
    record stays "pending" forever, so the NEXT pull_pending_work() call
    overwrites the local claim right back to pending (add_work_item uses
    INSERT OR REPLACE) — silently undoing every claim and causing the same
    item to be re-assigned, possibly to a different agent, on every single
    orchestrator run. Must run before pull_pending_work() in sync_once() so
    the pull sees the now-updated Convex status instead of stale "pending".

    Idempotent: if Convex already reflects the claim (e.g. a previous push
    partially succeeded), claimWorkItem's "Work item not available" error is
    expected, not a failure — treated as already-synced.
    """
    claimed = mem.conn.execute(
        "SELECT id, claimed_by FROM work_items WHERE status='claimed' AND claimed_by IS NOT NULL"
    ).fetchall()

    pushed = 0
    for row in claimed:
        try:
            _convex_mutation("agent_coordination:claimWorkItem", {
                "workItemId": row["id"],
                "agentId": row["claimed_by"],
            })
            pushed += 1
        except SyncError as e:
            if "not available" in str(e) or "not found" in str(e):
                continue  # already reflected on the Convex side — fine
            print(f"⚠️  Failed to push claim for {row['id']}: {e}")
        except requests.RequestException as e:
            print(f"⚠️  Failed to push claim for {row['id']} (connectivity): {e}")
            break

    return pushed


def push_checkpoints(mem: LocalMemory, limit: int = 50) -> int:
    """
    Push unsynced local checkpoints to Convex as the durable audit trail.
    Returns the number successfully pushed. Marks each as synced only after
    Convex confirms the write, so a mid-batch failure just retries next time.
    """
    checkpoints = mem.get_unsynced_checkpoints(limit=limit)
    pushed = 0

    for cp in checkpoints:
        try:
            _convex_mutation("agent_coordination:logCheckpoint", {
                "agent": cp["agent_id"],
                "checkpointType": _map_checkpoint_type(cp),
                "message": cp["decision"],
                "metrics": {"reasoning": cp.get("reasoning") or "", "confidence": cp.get("confidence") or 0},
            })
            mem.mark_checkpoint_synced(cp["id"])
            pushed += 1
        except (SyncError, requests.RequestException) as e:
            print(f"⚠️  Failed to push checkpoint {cp['id']} (will retry next sync): {e}")
            break  # stop on first failure — likely a connectivity issue, not worth hammering

    return pushed


def _map_checkpoint_type(cp: dict) -> str:
    """Local checkpoints don't carry Convex's checkpointType enum directly —
    infer a reasonable one from the decision text so the audit trail stays
    queryable by type on the Convex side."""
    decision = (cp.get("decision") or "").lower()
    if "error" in decision or "failed" in decision:
        return "error"
    if "assigned" in decision or "claimed" in decision:
        return "task_start"
    return "heartbeat"


def sync_once(mem: Optional[LocalMemory] = None) -> dict:
    """Run one full bidirectional sync pass. Returns a small summary dict."""
    owns_mem = mem is None
    mem = mem or LocalMemory()
    start = time.time()

    # Order matters: claims must reach Convex BEFORE pulling, or the pull
    # re-fetches the stale "pending" status and overwrites the local claim.
    claims_pushed = push_claims(mem)
    pulled = pull_pending_work(mem)
    checkpoints_pushed = push_checkpoints(mem)

    mem.log_sync("push", "claims", "batch", "success" if claims_pushed >= 0 else "error")
    mem.log_sync("pull", "work_items", "batch", "success" if pulled >= 0 else "error")
    mem.log_sync("push", "checkpoints", "batch", "success" if checkpoints_pushed >= 0 else "error")

    if owns_mem:
        mem.close()

    return {
        "pulled": pulled,
        "pushed": checkpoints_pushed,
        "claims_pushed": claims_pushed,
        "elapsed_ms": int((time.time() - start) * 1000),
    }


if __name__ == "__main__":
    result = sync_once()
    print(f"Sync complete: pushed {result['claims_pushed']} claim(s), "
          f"pulled {result['pulled']} work item(s), "
          f"pushed {result['pushed']} checkpoint(s) in {result['elapsed_ms']}ms")
