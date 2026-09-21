"""
Local memory database wrapper for Seridian orchestration.
SQLite-based cache for fast offline decision-making.
"""

import sqlite3
import json
import time
from pathlib import Path
from typing import Dict, List, Optional

DB_PATH = Path.home() / ".seridian" / "memory.db"


class LocalMemory:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row

        # Load schema
        schema_path = Path(__file__).parent / "schema.sql"
        with open(schema_path) as f:
            self.conn.executescript(f.read())
        self.conn.commit()

    # ========================
    # AGENT MANAGEMENT
    # ========================

    def register_agent(self, agent_id: str, name: str, role: str, capacity: int = 1):
        """Register an agent in local memory."""
        self.conn.execute("""
            INSERT OR REPLACE INTO agents
            (id, name, role, capacity, status, created_at)
            VALUES (?, ?, ?, ?, 'idle', ?)
        """, (agent_id, name, role, capacity, int(time.time() * 1000)))
        self.conn.commit()

    def get_agent(self, agent_id: str) -> Optional[Dict]:
        """Get agent state from local memory."""
        row = self.conn.execute(
            "SELECT * FROM agents WHERE id=?", (agent_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_available_agents(self, limit: int = 10) -> List[Dict]:
        """Get agents with free capacity."""
        rows = self.conn.execute("""
            SELECT id, name, role, capacity, status, last_claimed_work
            FROM agents
            WHERE status='idle'
            ORDER BY last_heartbeat DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]

    def heartbeat_agent(self, agent_id: str, status: str = "idle"):
        """Update agent heartbeat and status."""
        self.conn.execute("""
            UPDATE agents SET last_heartbeat=?, status=?
            WHERE id=?
        """, (int(time.time() * 1000), status, agent_id))
        self.conn.commit()

    # ========================
    # WORK ITEM MANAGEMENT
    # ========================

    def add_work_item(self, work_item: Dict):
        """Add or update a work item in local cache."""
        self.conn.execute("""
            INSERT OR REPLACE INTO work_items
            (id, lane, title, status, claimed_by, priority,
             created_at, updated_at, dependencies, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            work_item['id'],
            work_item['lane'],
            work_item['title'],
            work_item.get('status', 'pending'),
            work_item.get('claimed_by'),
            work_item.get('priority', 'medium'),
            work_item.get('created_at', int(time.time() * 1000)),
            int(time.time() * 1000),
            json.dumps(work_item.get('dependencies', [])),
            json.dumps(work_item.get('metadata', {}))
        ))
        self.conn.commit()

    def get_pending_work(self, lane: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """Get pending work items."""
        if lane:
            rows = self.conn.execute("""
                SELECT * FROM work_items
                WHERE status='pending' AND lane=?
                ORDER BY created_at ASC
                LIMIT ?
            """, (lane, limit)).fetchall()
        else:
            rows = self.conn.execute("""
                SELECT * FROM work_items
                WHERE status='pending'
                ORDER BY created_at ASC
                LIMIT ?
            """, (limit,)).fetchall()

        return [dict(row) for row in rows]

    def dependencies_satisfied(self, work_item: Dict) -> bool:
        """Check whether all of a work item's dependencies (the JSON-encoded
        list of work_item ids in its `dependencies` column) are status
        'completed' locally. Items with no dependencies are always
        satisfied. A dependency id that isn't found locally (not yet pulled
        from Convex, or genuinely unknown) is treated as unmet — fail safe,
        never assume a prerequisite is done just because we can't see it."""
        deps_raw = work_item.get("dependencies")
        if not deps_raw:
            return True

        try:
            dep_ids = json.loads(deps_raw)
        except (TypeError, json.JSONDecodeError):
            return True  # malformed/legacy data — don't block on it forever

        if not dep_ids:
            return True

        placeholders = ",".join("?" for _ in dep_ids)
        rows = self.conn.execute(
            f"SELECT id, status FROM work_items WHERE id IN ({placeholders})",
            dep_ids,
        ).fetchall()
        statuses = {row["id"]: row["status"] for row in rows}

        return all(statuses.get(dep_id) == "completed" for dep_id in dep_ids)

    def claim_work(self, work_id: str, agent_id: str):
        """Claim a work item for an agent."""
        self.conn.execute("""
            UPDATE work_items
            SET status='claimed', claimed_by=?, updated_at=?
            WHERE id=?
        """, (agent_id, int(time.time() * 1000), work_id))

        # Also update agent's last claimed work
        self.conn.execute("""
            UPDATE agents SET last_claimed_work=?
            WHERE id=?
        """, (work_id, agent_id))

        # A fresh claim supersedes any crash-recovery flag from a prior
        # unclean restart (e.g. the item was force-unclaimed and reassigned).
        self._resolve_crash_recovery(work_id)

        self.conn.commit()

    def update_work_status(self, work_id: str, status: str, result: Optional[Dict] = None):
        """Update work item status."""
        self.conn.execute("""
            UPDATE work_items
            SET status=?, updated_at=?, result=?
            WHERE id=?
        """, (status, int(time.time() * 1000), json.dumps(result) if result else None, work_id))

        # Moving out of 'claimed' (in_progress/completed/failed) proves the
        # claim wasn't actually orphaned — clear any crash-recovery flag.
        if status != "claimed":
            self._resolve_crash_recovery(work_id)

        self.conn.commit()

    # ========================
    # CRASH RECOVERY
    # ========================
    # Borrowed from hermes-agent's session-lifecycle crash recovery: a
    # missing clean-shutdown marker means the orchestrator didn't exit
    # gracefully last time (crash, kill -9, machine restart). Anything still
    # 'claimed' from that run might be orphaned. Escalation mirrors FailChain
    # (see docs/QUALITY_GATES.md): flagged once or twice is a warning; stuck
    # across 3+ consecutive unclean restarts is a critical intervention
    # (force-unclaim and let it be reassigned).

    def flag_orphaned_claims(self) -> List[Dict]:
        """Call once at orchestrator startup when the clean-shutdown marker
        is missing. Increments restart_count for items already flagged from
        a prior unclean restart, or inserts a fresh row at count 1."""
        claimed = self.conn.execute(
            "SELECT id FROM work_items WHERE status='claimed'"
        ).fetchall()

        now = int(time.time() * 1000)
        flagged = []

        for row in claimed:
            work_id = row["id"]
            existing = self.conn.execute(
                "SELECT restart_count FROM crash_recovery WHERE work_item_id=? AND resolved=0",
                (work_id,),
            ).fetchone()

            if existing:
                new_count = existing["restart_count"] + 1
                self.conn.execute(
                    "UPDATE crash_recovery SET restart_count=?, last_flagged_at=? WHERE work_item_id=?",
                    (new_count, now, work_id),
                )
            else:
                new_count = 1
                self.conn.execute(
                    """INSERT INTO crash_recovery
                       (work_item_id, first_flagged_at, last_flagged_at, restart_count, resolved)
                       VALUES (?, ?, ?, 1, 0)""",
                    (work_id, now, now),
                )

            flagged.append({"work_item_id": work_id, "restart_count": new_count})

        self.conn.commit()
        return flagged

    def get_stuck_claims(self, threshold: int = 3) -> List[Dict]:
        """Items flagged as orphaned across `threshold`+ consecutive unclean
        restarts without ever resolving — the FailChain "critical" tier."""
        rows = self.conn.execute(
            "SELECT work_item_id, restart_count FROM crash_recovery WHERE restart_count >= ? AND resolved=0",
            (threshold,),
        ).fetchall()
        return [dict(r) for r in rows]

    def unclaim_work(self, work_id: str):
        """Force a claimed item back to pending, clearing claimed_by (unlike
        a plain update_work_status(status='pending') call, which would leave
        a stale claimed_by on a supposedly-unclaimed item). Used when a claim
        is deemed orphaned beyond recovery — see flag_orphaned_claims()."""
        self.conn.execute(
            "UPDATE work_items SET status='pending', claimed_by=NULL, updated_at=? WHERE id=?",
            (int(time.time() * 1000), work_id),
        )
        self._resolve_crash_recovery(work_id)
        self.conn.commit()

    def _resolve_crash_recovery(self, work_id: str):
        self.conn.execute(
            "UPDATE crash_recovery SET resolved=1 WHERE work_item_id=? AND resolved=0",
            (work_id,),
        )

    # ========================
    # CHECKPOINT LOGGING
    # ========================

    def log_checkpoint(self, agent_id: str, turn: int, decision: str,
                      reasoning: Optional[str] = None,
                      confidence: float = 0.5,
                      metrics: Optional[Dict] = None):
        """Log an agent decision checkpoint."""
        checkpoint_id = f"{agent_id}_{turn}_{int(time.time() * 1000)}"

        self.conn.execute("""
            INSERT INTO checkpoints
            (id, agent_id, turn, timestamp, decision, reasoning, confidence, metrics)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            checkpoint_id,
            agent_id,
            turn,
            int(time.time() * 1000),
            decision,
            reasoning,
            confidence,
            json.dumps(metrics) if metrics else None
        ))
        self.conn.commit()
        return checkpoint_id

    def get_unsynced_checkpoints(self, limit: int = 50) -> List[Dict]:
        """Get checkpoints that haven't been synced to Convex."""
        rows = self.conn.execute("""
            SELECT * FROM checkpoints
            WHERE synced=0
            ORDER BY timestamp ASC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]

    def mark_checkpoint_synced(self, checkpoint_id: str):
        """Mark checkpoint as synced to Convex."""
        self.conn.execute("""
            UPDATE checkpoints SET synced=1 WHERE id=?
        """, (checkpoint_id,))
        self.conn.commit()

    # ========================
    # METRICS & SNAPSHOTS
    # ========================

    def snapshot_metric(self, entity_type: str, entity_id: str, data: Dict):
        """Store a metric snapshot."""
        snapshot_id = f"{entity_type}_{entity_id}_{int(time.time() * 1000)}"

        self.conn.execute("""
            INSERT INTO memory_snapshots
            (id, entity_type, entity_id, data, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (
            snapshot_id,
            entity_type,
            entity_id,
            json.dumps(data),
            int(time.time() * 1000)
        ))
        self.conn.commit()

    def get_latest_metric(self, entity_type: str, entity_id: str) -> Optional[Dict]:
        """Get the latest snapshot for an entity."""
        row = self.conn.execute("""
            SELECT data FROM memory_snapshots
            WHERE entity_type=? AND entity_id=?
            ORDER BY timestamp DESC
            LIMIT 1
        """, (entity_type, entity_id)).fetchone()

        if row:
            return json.loads(row[0])
        return None

    # ========================
    # TOKEN TRACKING
    # ========================

    def log_token_usage(self, model: str, tokens_in: int, tokens_out: int, cost: float):
        """Log token usage for cost tracking."""
        usage_id = f"{model}_{int(time.time() * 1000)}"

        self.conn.execute("""
            INSERT INTO token_usage
            (id, timestamp, model, tokens_in, tokens_out, cost)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            usage_id,
            int(time.time() * 1000),
            model,
            tokens_in,
            tokens_out,
            cost
        ))
        self.conn.commit()

    def get_token_stats(self) -> Dict:
        """Get token usage statistics."""
        rows = self.conn.execute("""
            SELECT model, SUM(tokens_in) as total_in,
                   SUM(tokens_out) as total_out, SUM(cost) as total_cost
            FROM token_usage
            GROUP BY model
        """).fetchall()

        return {
            "by_model": {
                dict(row)['model']: {
                    "tokens_in": dict(row)['total_in'],
                    "tokens_out": dict(row)['total_out'],
                    "cost": dict(row)['total_cost'],
                }
                for row in rows
            }
        }

    # ========================
    # SYNC TRACKING
    # ========================

    def log_sync(self, direction: str, entity_type: str, entity_id: str,
                 status: str, error: Optional[str] = None):
        """Log a sync event."""
        sync_id = f"{direction}_{entity_type}_{entity_id}_{int(time.time() * 1000)}"

        self.conn.execute("""
            INSERT INTO sync_log
            (id, direction, entity_type, entity_id, timestamp, status, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            sync_id,
            direction,
            entity_type,
            entity_id,
            int(time.time() * 1000),
            status,
            error
        ))
        self.conn.commit()

    # ========================
    # CLEANUP
    # ========================

    def cleanup_old_checkpoints(self, keep_days: int = 7):
        """Clean up old checkpoints (keep recent for audit trail)."""
        cutoff_ms = int((time.time() - keep_days * 86400) * 1000)

        self.conn.execute("""
            DELETE FROM checkpoints
            WHERE timestamp < ? AND synced=1
        """, (cutoff_ms,))
        self.conn.commit()

    def cleanup_old_snapshots(self, keep_days: int = 1):
        """Clean up old metric snapshots (keep 1 day)."""
        cutoff_ms = int((time.time() - keep_days * 86400) * 1000)

        self.conn.execute("""
            DELETE FROM memory_snapshots
            WHERE timestamp < ?
        """, (cutoff_ms,))
        self.conn.commit()

    def close(self):
        """Close database connection."""
        self.conn.close()
