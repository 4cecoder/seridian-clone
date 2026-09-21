#!/usr/bin/env python3
"""
Standalone agent bootstrap — registers the 10 core agents in local memory.

Deliberately independent of Orchestrator: Orchestrator's constructor requires
a live local LLM server (it health-checks on init), but registering agents is
pure bookkeeping and shouldn't need MLX running just to seed the roster.
"""

from memory import LocalMemory

AGENTS = [
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


def bootstrap_agents() -> int:
    mem = LocalMemory()
    for agent_id, name, role in AGENTS:
        mem.register_agent(agent_id, name, role, capacity=2)
    mem.close()
    return len(AGENTS)


if __name__ == "__main__":
    count = bootstrap_agents()
    print(f"Registered {count} agents in local memory ({__import__('memory').DB_PATH})")
