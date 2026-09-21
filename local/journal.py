"""
Structured, durable event journal for the local orchestration layer.

Modeled on the SmallCTL runlog event-catalog pattern (a maintained event
vocabulary + append-only JSONL log), scaled down for this system's size.
Human-readable logging (Python's `logging` module, used throughout
orchestrator.py) stays as-is — this is additive: a machine-parseable,
durable trail for debugging and future tooling (crash-recovery audits,
per-work-item timelines), not a replacement for console output.

Storage: ~/.seridian/journal.jsonl, one JSON object per line, append-only.

Event schema (event_schema_version: 1):
    {
      "timestamp": ISO 8601 UTC, e.g. "2026-09-20T22:23:00.123456+00:00",
      "channel": str,             # orchestrator | sync | crash_recovery
      "event": str,               # see EVENT CATALOG below
      "message": str,             # human-readable summary
      "level": str,               # debug | info | warning | error
      "event_schema_version": 1,
      "trace_id": str | None,     # "<work_item_id>:turn-<N>" when tied to
                                   # a specific work item + orchestrator turn
      "data": dict,               # event-specific fields, see catalog
    }

EVENT CATALOG — keep this in sync with the emit call sites in orchestrator.py.
Adding a new event: emit it via log_event(), then add a row here.

Channel: orchestrator
  orchestrator_started       | Orchestrator initialized, local LLM healthy     | {}
  heartbeat_turn             | One heartbeat cycle completed                   | {pending, assigned, blocked, complex, available_agents, elapsed_ms}
  work_assigned               | A work item was assigned + claimed to an agent  | {work_item_id, agent_id}
  work_needs_haiku            | Work item classified complex, flagged for Haiku | {work_item_id}
  no_available_agents         | Pending work existed but no idle agents         | {pending}

Channel: sync
  sync_completed              | One sync_once() pass finished                   | {pulled, pushed, claims_pushed, elapsed_ms}
  sync_failed                  | sync_once() raised                              | {error}

Channel: crash_recovery
  unclean_shutdown_detected    | Startup found no clean-shutdown marker          | {flagged_count}
  claim_orphan_flagged         | A claimed item flagged as possibly orphaned     | {work_item_id, restart_count}
  claim_force_unclaimed        | A stuck claim (3+ restarts) was force-unclaimed | {work_item_id, restart_count}
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

JOURNAL_PATH = Path.home() / ".seridian" / "journal.jsonl"
EVENT_SCHEMA_VERSION = 1


def log_event(
    channel: str,
    event: str,
    message: str,
    level: str = "info",
    trace_id: Optional[str] = None,
    data: Optional[dict] = None,
) -> None:
    """Append one structured event to the journal. Never raises — a journal
    write failure (disk full, permissions) must never take down the
    orchestrator; it's swallowed and printed to stderr instead."""
    row = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "event": event,
        "message": message,
        "level": level,
        "event_schema_version": EVENT_SCHEMA_VERSION,
        "trace_id": trace_id,
        "data": data or {},
    }
    try:
        JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(JOURNAL_PATH, "a") as f:
            f.write(json.dumps(row) + "\n")
    except OSError as e:
        print(f"⚠️  journal write failed (continuing): {e}")


def read_events(
    channel: Optional[str] = None,
    event: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Read the most recent `limit` events, optionally filtered by channel
    and/or event name. Returns oldest-first (chronological order), matching
    how a human reads a tail."""
    if not JOURNAL_PATH.exists():
        return []

    matched = []
    with open(JOURNAL_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if channel and row.get("channel") != channel:
                continue
            if event and row.get("event") != event:
                continue
            matched.append(row)

    return matched[-limit:]


if __name__ == "__main__":
    log_event(
        "orchestrator",
        "orchestrator_started",
        "Manual journal.py smoke test",
        data={"test": True},
    )
    print(f"Wrote a test event to {JOURNAL_PATH}")
    print("Last 5 events:")
    for row in read_events(limit=5):
        print(f"  [{row['timestamp']}] {row['channel']}.{row['event']}: {row['message']}")
