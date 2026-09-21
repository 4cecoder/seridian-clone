#!/usr/bin/env python3
"""
Main orchestrator loop for Seridian SWE gauntlet.
Runs every 10-60 seconds, claims work items, coordinates agents.
Uses local LLM for fast, free decisions.
"""

import time
import json
import argparse
import logging
import signal
import sys
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from memory import LocalMemory
from local_llm import decide_work_assignment, check_ollama_health, classify_task_complexity
from sync import sync_once
import journal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger('orchestrator')

# Written on graceful shutdown, checked (and consumed) at the next startup.
# Missing on startup means the previous run didn't exit cleanly — see
# Orchestrator._check_crash_recovery().
CLEAN_SHUTDOWN_MARKER = Path.home() / ".seridian" / ".clean_shutdown"


class Orchestrator:
    """Main coordination loop for Seridian agents."""

    def __init__(self):
        self.memory = LocalMemory()
        self.turn = 0
        self.last_sync = 0

        # Check local LLM is available
        if not check_ollama_health():
            raise RuntimeError(
                "MLX server not running. Start with: "
                "python -m mlx_lm.server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --port 8080"
            )

        logger.info("✅ Orchestrator initialized. Local MLX server healthy.")
        journal.log_event("orchestrator", "orchestrator_started", "Orchestrator initialized, local LLM healthy")

    def _write_clean_shutdown_marker(self):
        CLEAN_SHUTDOWN_MARKER.parent.mkdir(parents=True, exist_ok=True)
        CLEAN_SHUTDOWN_MARKER.touch()

    def _check_crash_recovery(self):
        """Run once at the start of run_loop(). If the previous run exited
        cleanly, the marker is present — consume it and move on. If it's
        missing, the previous run crashed, was kill -9'd, or the machine
        restarted: anything still 'claimed' from that run might be silently
        stuck forever (nothing else will ever reclaim it). Flag it, and if
        the SAME item has now shown up as claimed-but-unresolved across 3+
        consecutive unclean restarts, force-unclaim it so it gets reassigned
        rather than staying stuck indefinitely."""
        if CLEAN_SHUTDOWN_MARKER.exists():
            CLEAN_SHUTDOWN_MARKER.unlink()
            return

        flagged = self.memory.flag_orphaned_claims()
        if not flagged:
            return

        logger.warning(
            f"⚠️  Unclean shutdown detected (no {CLEAN_SHUTDOWN_MARKER}) — "
            f"{len(flagged)} claimed work item(s) may be orphaned"
        )
        journal.log_event(
            "crash_recovery", "unclean_shutdown_detected",
            f"{len(flagged)} claimed work item(s) may be orphaned",
            level="warning", data={"flagged_count": len(flagged)},
        )
        for item in flagged:
            journal.log_event(
                "crash_recovery", "claim_orphan_flagged",
                f"{item['work_item_id']} flagged (restart_count={item['restart_count']})",
                level="warning", trace_id=item["work_item_id"],
                data={"work_item_id": item["work_item_id"], "restart_count": item["restart_count"]},
            )

        for item in self.memory.get_stuck_claims(threshold=3):
            work_id = item["work_item_id"]
            logger.error(
                f"🚨 Work item {work_id} claimed-but-orphaned across "
                f"{item['restart_count']} consecutive unclean restarts — "
                f"force-unclaiming for reassignment"
            )
            journal.log_event(
                "crash_recovery", "claim_force_unclaimed",
                f"{work_id} force-unclaimed after {item['restart_count']} unclean restarts",
                level="error", trace_id=work_id,
                data={"work_item_id": work_id, "restart_count": item["restart_count"]},
            )
            self.memory.unclaim_work(work_id)

    def register_agents(self):
        """Register the 10 core agents in local memory."""
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
            self.memory.register_agent(agent_id, name, role, capacity=2)

        logger.info(f"✅ Registered {len(agents)} agents")

    def heartbeat(self):
        """Main orchestration loop."""
        self.turn += 1
        start_time = time.time()

        try:
            # 1. Update own status
            self.memory.heartbeat_agent("orchestrator", status="working")

            # 2. Get pending work
            pending_raw = self.memory.get_pending_work(limit=5)

            # Skip items whose dependencies (work_items.dependencies, a
            # JSON-encoded list of prerequisite work_item ids) haven't all
            # completed yet — assigning a blocked item would let an engineer
            # start on it before its prerequisite exists. Not an error: it
            # just waits for a future cycle once the dependency completes.
            pending = []
            blocked_count = 0
            for item in pending_raw:
                if self.memory.dependencies_satisfied(item):
                    pending.append(item)
                else:
                    blocked_count += 1

            if blocked_count:
                logger.debug(
                    f"⏳ Skipping {blocked_count} item(s) with unmet dependencies this cycle"
                )

            if not pending:
                self.memory.heartbeat_agent("orchestrator", status="idle")
                # Sync still needs to run on the idle path — a claim that
                # failed to push in a previous cycle (e.g. Convex was briefly
                # unreachable) would otherwise never retry until new pending
                # work happened to show up locally.
                if time.time() - self.last_sync > 60:
                    self.sync_to_convex()
                    self.last_sync = time.time()
                return {
                    "turn": self.turn,
                    "pending": 0,
                    "assigned": 0,
                    "blocked": blocked_count,
                    "elapsed_ms": int((time.time() - start_time) * 1000),
                }

            # 3. Heartbeat all agents
            for agent in self.memory.get_available_agents(limit=10):
                self.memory.heartbeat_agent(agent['id'], status="idle")

            # 4. Use local LLM to decide assignments
            available_agents = self.memory.get_available_agents(limit=10)

            if not available_agents:
                logger.warning("⚠️  No available agents")
                journal.log_event(
                    "orchestrator", "no_available_agents",
                    f"{len(pending)} pending item(s) but no idle agents",
                    level="warning", data={"pending": len(pending)},
                )
                return {
                    "turn": self.turn,
                    "pending": len(pending),
                    "assigned": 0,
                    "reason": "no_available_agents",
                    "elapsed_ms": int((time.time() - start_time) * 1000),
                }

            # Classify work items by complexity (by title, not a fixed task_type —
            # TaskRouter.route("implement_feature", ...) would always short-circuit
            # to "haiku" since that task_type is in HAIKU_TASKS, ignoring the item)
            simple_work = []
            complex_work = []

            for item in pending:
                if classify_task_complexity(item.get("title", "")) == "local":
                    simple_work.append(item)
                else:
                    complex_work.append(item)

            assignments = {}

            # Work assignment is for implementation work, so only offer
            # engineer-role agents as candidates — otherwise the choice
            # primitive can (correctly, since it's a real valid agent) hand
            # implementation work to an orchestrator/reviewer/integrator/
            # analyst just because they happened to be idle.
            engineer_agents = [a for a in available_agents if a.get("role") == "engineer"]

            # Assign simple work using local LLM
            if simple_work and engineer_agents:
                try:
                    result = decide_work_assignment(
                        simple_work, engineer_agents, {}
                    )
                    assignments.update(result.get("assignments", {}))

                    logger.info(
                        f"🤖 Local LLM assigned {len(result['assignments'])} items "
                        f"({result['elapsed_ms']}ms)"
                    )
                except Exception as e:
                    logger.error(f"❌ Local LLM error: {e}")
                    # Fallback: simple round-robin
                    for i, item in enumerate(simple_work):
                        agent = available_agents[i % len(available_agents)]
                        assignments[item['id']] = agent['id']

            # Complex work needs Haiku (flag for later processing)
            for item in complex_work:
                # Mark as pending_haiku for the engineer to pick up
                assignments[item['id']] = "NEEDS_HAIKU"
                journal.log_event(
                    "orchestrator", "work_needs_haiku",
                    f"{item['id']} classified complex, flagged for Haiku",
                    trace_id=f"{item['id']}:turn-{self.turn}",
                    data={"work_item_id": item['id']},
                )

            # 5. Claim assigned work
            assigned_count = 0
            for work_id, agent_id in assignments.items():
                if agent_id == "NEEDS_HAIKU":
                    # Don't auto-claim, engineer will read this flag
                    continue

                self.memory.claim_work(work_id, agent_id)
                assigned_count += 1

                logger.info(f"✅ Claimed: {work_id} → {agent_id}")
                journal.log_event(
                    "orchestrator", "work_assigned",
                    f"{work_id} -> {agent_id}",
                    trace_id=f"{work_id}:turn-{self.turn}",
                    data={"work_item_id": work_id, "agent_id": agent_id},
                )

            # 6. Log checkpoint
            self.memory.log_checkpoint(
                agent_id="orchestrator",
                turn=self.turn,
                decision=f"Assigned {assigned_count} items, flagged {len(complex_work)} for Haiku",
                confidence=0.95,
                metrics={
                    "assigned": assigned_count,
                    "complex_flagged": len(complex_work),
                    "available_agents": len(available_agents),
                    "latency_ms": int((time.time() - start_time) * 1000),
                }
            )

            # 7. Sync to Convex (every 60s)
            if time.time() - self.last_sync > 60:
                self.sync_to_convex()
                self.last_sync = time.time()

            # 8. Cleanup old data
            if self.turn % 100 == 0:
                self.memory.cleanup_old_checkpoints(keep_days=7)
                self.memory.cleanup_old_snapshots(keep_days=1)

            self.memory.heartbeat_agent("orchestrator", status="idle")

            elapsed_ms = int((time.time() - start_time) * 1000)
            journal.log_event(
                "orchestrator", "heartbeat_turn",
                f"Turn {self.turn}: assigned {assigned_count}, {len(complex_work)} to Haiku, "
                f"{blocked_count} blocked",
                trace_id=f"turn-{self.turn}",
                data={
                    "pending": len(pending), "assigned": assigned_count,
                    "blocked": blocked_count, "complex": len(complex_work),
                    "available_agents": len(available_agents), "elapsed_ms": elapsed_ms,
                },
            )

            return {
                "turn": self.turn,
                "pending": len(pending),
                "assigned": assigned_count,
                "complex": len(complex_work),
                "blocked": blocked_count,
                "available_agents": len(available_agents),
                "elapsed_ms": elapsed_ms,
            }

        except Exception as e:
            logger.error(f"❌ Heartbeat error: {e}", exc_info=True)
            self.memory.heartbeat_agent("orchestrator", status="error")
            return {
                "turn": self.turn,
                "error": str(e),
                "elapsed_ms": int((time.time() - start_time) * 1000),
            }

    def sync_to_convex(self):
        """Bidirectional sync with Convex (source of truth): pull pending work
        into the local cache, push unsynced checkpoints as the audit trail."""
        try:
            result = sync_once(mem=self.memory)
            if result["pulled"] or result["pushed"]:
                logger.info(
                    f"📤 Synced with Convex: pulled {result['pulled']} work item(s), "
                    f"pushed {result['pushed']} checkpoint(s) ({result['elapsed_ms']}ms)"
                )
            journal.log_event(
                "sync", "sync_completed",
                f"pulled {result['pulled']}, pushed {result['pushed']} checkpoint(s), "
                f"pushed {result.get('claims_pushed', 0)} claim(s)",
                data=result,
            )
        except Exception as e:
            logger.error(f"❌ Sync error: {e}")
            journal.log_event("sync", "sync_failed", str(e), level="error", data={"error": str(e)})

    def run_loop(self, interval_seconds: int = 10):
        """Run continuous orchestration loop."""
        logger.info(f"🎬 Starting orchestrator loop (interval: {interval_seconds}s)")

        self._check_crash_recovery()

        def _handle_sigterm(signum, frame):
            # `seridian local down` (and most process managers) send SIGTERM
            # for a normal stop. Without a handler, Python terminates
            # immediately with no cleanup — indistinguishable from a crash on
            # the next startup. This makes an intentional stop write the
            # clean-shutdown marker just like Ctrl+C already does below.
            logger.info("⏹️  Orchestrator stopping (SIGTERM)")
            self._write_clean_shutdown_marker()
            self.memory.close()
            sys.exit(0)

        signal.signal(signal.SIGTERM, _handle_sigterm)

        try:
            self.register_agents()

            iteration = 0
            while True:
                iteration += 1

                # Run heartbeat
                result = self.heartbeat()

                # Log result
                status = "✅" if "error" not in result else "❌"
                logger.info(
                    f"{status} Turn {result['turn']}: "
                    f"pending={result.get('pending', 0)}, "
                    f"assigned={result.get('assigned', 0)}, "
                    f"latency={result.get('elapsed_ms', 0)}ms"
                )

                # Sleep until next iteration
                time.sleep(interval_seconds)

        except KeyboardInterrupt:
            logger.info("⏹️  Orchestrator stopping (Ctrl+C)")
            self._write_clean_shutdown_marker()
            self.memory.close()

        except Exception as e:
            # Deliberately do NOT write the clean-shutdown marker here — an
            # uncaught exception is exactly the "unclean" case
            # _check_crash_recovery() needs to detect on the next startup.
            logger.error(f"❌ Fatal error: {e}", exc_info=True)
            self.memory.close()
            raise

    def run_once(self):
        """Run a single heartbeat (useful for testing/CI)."""
        self.register_agents()
        result = self.heartbeat()
        self.memory.close()
        return result


def main():
    parser = argparse.ArgumentParser(
        description="Seridian orchestrator - coordinate agent work"
    )
    parser.add_argument(
        "--loop",
        type=int,
        default=None,
        help="Run continuous loop with interval (seconds)"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run single heartbeat and exit"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )

    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)

    orchestrator = Orchestrator()

    try:
        if args.once:
            result = orchestrator.run_once()
            print(json.dumps(result, indent=2))
        elif args.loop:
            orchestrator.run_loop(interval_seconds=args.loop)
        else:
            # Default: run with 10s interval
            orchestrator.run_loop(interval_seconds=10)

    except Exception as e:
        logger.error(f"Error: {e}")
        orchestrator.memory.close()
        exit(1)


if __name__ == "__main__":
    main()
