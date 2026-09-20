# Seridian Agent System — Software Engineering Gauntlet

> **Purpose:** Define a suite of coordinated Haiku agents that plan, build, review, and optimize work across all 15 Seridian lanes, all sharing one Convex database schema.
>
> **Status:** Design phase. Agents are Haiku instances with no persistent state—they coordinate through the shared Convex DB and log checkpoints there.

## System architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│              AGENT COORDINATION LAYER (Convex)                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ agentConfig  │  │agentWorkItems│  │agentCheckpts │           │
│  │  Registry    │  │  Work Queue  │  │   Telemetry  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ laneMetrics  │  │ Lock/Ownership (via claimWorkItem)        │
│  │  Timeseries  │  │              │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
              ↑              ↑              ↑
              │              │              │
┌─────────────┴──┐  ┌─────────┴────┐  ┌────┴──────────────┐
│  ORCHESTRATOR  │  │  PLANNER     │  │  ENGINEER FLEET   │
│   (Haiku)      │  │   (Haiku)    │  │   (6× Haiku)      │
│                │  │              │  │                   │
│ - Startup      │  │ - Gate eval  │  │ Per-lane:         │
│ - Heartbeat    │  │ - Wave plan  │  │ - Impl/features   │
│ - Cascade      │  │ - QR prep    │  │ - Unit tests      │
│ - Error handle │  │ - Backlog    │  │ - Docs/specs      │
└────────────────┘  └──────────────┘  └───────────────────┘
        │                   │                    │
        └───────────┬───────┴────────────────────┘
                    │
        ┌───────────┴──────────────┬──────────────┐
        │                          │              │
    ┌─────────┐           ┌──────────────┐  ┌─────────┐
    │REVIEWER │           │ INTEGRATOR   │  │ANALYST  │
    │(Haiku)  │           │ (Haiku)      │  │(Haiku)  │
    │         │           │              │  │         │
    │ - Code  │           │ - Glue layer │  │- Metrics│
    │ - Arch  │           │ - Widget API │  │- Growth │
    │ - Tests │           │ - Moat eng   │  │- Churn  │
    └─────────┘           └──────────────┘  └─────────┘
```

## The agent suite (6 types, all Haiku)

### 1. ORCHESTRATOR (1 instance, persistent loop)

**Role:** System heartbeat, startup, cascade coordination.

**Responsibilities:**
- Register agents on boot
- Poll `agentConfig` for active agents + their capacity
- Check for failed work items and escalate
- Balance work across the engineer fleet
- Watch for deadlocks (blocked work chains)

**API calls:**
- `getAgentsByRole("orchestrator|engineer|planner|...")` — who's alive
- `logCheckpoint(...)` — every 60s heartbeat, or on event
- `getPendingWork(lane, limit)` — scan for work needing assignment
- `getWorkItemDependencies(...)` — detect deadlocks

**Implementation style:**
- Runs as a `@convex-dev/workpool` singleton task or a cron job
- Logs one `heartbeat` checkpoint every 60s
- Logs `error` checkpoints when work fails or deadlocks detected

---

### 2. PLANNER (1 instance, triggered)

**Role:** Strategy execution—turn quarterly reviews, gates, and GTM events into concrete work.

**Responsibilities:**
- Re-score the five gates every quarter (Seridian STRATEGY.md)
- Plan wave openings based on revenue gates
- Generate backlog from gate outcomes (e.g., "Designs blocked until Wave 1 MRR ≥$500")
- Create quarterly objectives as work items
- Flag fold candidates (Blog, Help, Vault if security-gated)

**API calls:**
- `createWorkItem(workType="planning", title="Q4 re-score: Auth gate 1", ...)` — create planning work
- `recordLaneMetric(lane="auth", metric="signups", value=150)` — ingest scorecard data
- `logCheckpoint(...)` — "Q3 re-score complete: Auth 4/5, fold Blog candidate, unblock Wave 2"

**Implementation style:**
- Triggered by a Convex cron job at quarter boundaries, or manually via Claude Code
- Reads RESEARCH.md, STRATEGY.md, GTM_FIRST_1K.md from the repo
- Outputs quarterly objectives + lane metrics into Convex
- Hands work to the engineer fleet via `createWorkItem(...)`

---

### 3. ENGINEER (6 instances, one per subsystem)

**Subsystems** (lanes grouped by architecture):
1. **Spine** (Auth + Mail + API + Status)
2. **Forms & Data**
3. **CRM & Operations** (CRM + Help)
4. **Publish** (Blog + Docs)
5. **Design** (Designs + Sites engine)
6. **Trust** (Sign + Vault)

**Responsibilities per engineer:**
- Claim work items for their subsystem
- Implement features, fixes, tests
- Update work item status (in_progress → completed)
- Log checkpoints at key milestones
- Hand off to REVIEWER and INTEGRATOR when done

**API calls:**
- `claimWorkItem(workItemId)` — exclusive lock
- `updateWorkItemProgress(workItemId, "in_progress"|"completed", result)` — write results
- `logCheckpoint(agent="engineer-spine", message="implemented auth refresh flow")` — telemetry
- `getPendingWork(lane="auth", limit=3)` — check own backlog

**Implementation style:**
- Haiku instance spawned per work item
- Reads the item description and dependencies from Convex
- Works directly with the codebase (`/Users/fource/bytecats/adventurers/seridian-systems/seridian`)
- Runs tests, linting, builds locally before marking done
- Passes output/PR link in `result.output` field

---

### 4. REVIEWER (1 instance, triggered by engineer completion)

**Role:** Code review, architecture validation, test coverage.

**Responsibilities:**
- Review engineer output (code, tests, docs)
- Check against Convex guidelines (`convex/_generated/ai/guidelines.md`)
- Run `/code-review` on changed code
- Verify Seridian-specific rules (no stack naming, house style, etc.)
- Approve or block with feedback

**API calls:**
- `getWorkItemDependencies(workItemId)` — understand context
- `updateWorkItemProgress(workItemId, "in_progress"|"completed"|"failed", result)` — approve/block
- `logCheckpoint(agent="reviewer", message="approved auth MFA tests, blocked on naming")` — telemetry

**Implementation style:**
- Triggered when an engineer marks work "completed"
- Runs Claude Code's `/code-review` skill on diffs
- If approval: marks work "completed", unblocks downstream items
- If blocked: marks "failed" with feedback, re-queues to engineer

---

### 5. INTEGRATOR (1 instance, runs after wave launches)

**Role:** Ensure lane composition, widget APIs, event bus wiring.

**Responsibilities:**
- After each lane ships, wire it into the umbrella (Auth entitlements, API gateway, Mail templates, etc.)
- Validate composition: widget APIs match Sites consumer expectations
- Test Automations triggers for new lane events
- Update API event schemas
- Ensure no stack leakage into marketing copy (house-style enforcement)

**API calls:**
- `createWorkItem(workType="integration", lane="auth", title="Wire Auth entitlements into Forms paywall")` — create integration work
- `logCheckpoint(agent="integrator", message="validated Forms widget API against Sites consumer")` — log
- `recordLaneMetric(lane="all", metric="integration_ready", value=1)` — mark ready

**Implementation style:**
- Runs after REVIEWER approves a lane launch
- Reads lane BUSINESS.md + FLOWS.md, Sites BUSINESS.md, Automations schema
- Tests wire-up in a staging environment
- Documents integration patterns in code comments

---

### 6. ANALYST (1 instance, continuous)

**Role:** Measure activation, growth, churn, and flag gate failures.

**Responsibilities:**
- Ingest weekly scorecards (signups, activated, paid, MRR, churn)
- Calculate gate status: Growth gate, Synergy score, Solo-maintainer test
- Plot activation curves per lane vs. targets (STRATEGY.md § GTM_FIRST_1K.md)
- Alert on gate failures (e.g., "Auth activation 25%, target 40%")
- Feed quarterly review prep (PLAYBOOK.md § Quarterly review checklist)

**API calls:**
- `recordLaneMetric(lane="auth", metric="signups", value=50)` — ingest scorecard data
- `getLaneMetrics(lane="auth", metric="activation_rate", hoursBack=168)` — analyze trends
- `logCheckpoint(agent="analyst", message="Auth growth gate: pass (activated +15% QoQ)")` — report
- `createWorkItem(workType="analysis", title="Q3 activation analysis: Blog fold candidate")` — queue QR work

**Implementation style:**
- Runs every Monday at 9am (cron trigger or scheduled Claude Code loop)
- Reads weekly scorecard from GTM_FIRST_1K.md template
- Calculates metrics and compares to benchmarks
- Outputs gate verdicts for the Planner's quarterly review

---

## Work item lifecycle

```
pending → [ENGINEER claims] → claimed
  ↓
  → [ENGINEER implements] → in_progress
  ↓
  → [ENGINEER marks done] → completed
  ↓
  → [REVIEWER approves OR REVIEWER blocks] → completed OR failed
  ↓
  → [if failed] → re-queue to pending (engineer reads feedback)
  ↓
  → [if completed] → unblock dependent work items
```

**Dependency rules:**
- A work item in "pending" with `blockedBy != []` cannot be claimed until all blockers complete
- When work completes, the orchestrator scans for unblocked pending items and logs alerts
- Circular dependencies are detected and logged as critical errors

---

## Shared Convex tables (atomic + lock-free)

### `agentWorkItems`
- **Columns:** `workType`, `lane`, `title`, `status`, `claimedBy`, `result`, `dependencies`, `blockedBy`, `createdAt`, `updatedAt`
- **Indexes:** `by_status`, `by_lane`, `by_claimedBy`, `by_status_and_lane`
- **Lock mechanism:** `claimWorkItem(workItemId, agentId)` is atomic—only one agent wins the claim
- **Safe concurrent access:** Multiple agents query `getPendingWork()` → each claims ≤1 item → no conflicts

### `agentCheckpoints`
- **Columns:** `agent`, `checkpointType`, `message`, `laneContext`, `metrics`, `timestamp`
- **Usage:** Agent telemetry, audit trail, error logging
- **No contention:** Append-only table, each agent writes its own rows

### `laneMetrics`
- **Columns:** `lane`, `metric`, `value`, `timestamp`, `metadata`
- **Usage:** Scorecard data, gate calculations, trend analysis
- **No contention:** Analyst writes, others read

### `agentConfig`
- **Columns:** `agentId`, `role`, `lanes`, `capabilities`, `maxConcurrentTasks`, `active`
- **Usage:** Agent registry, capability discovery, capacity tracking
- **Update pattern:** Agents register on boot; orchestrator reads to discover active fleet

---

## Token efficiency strategy (all Haiku)

### Why Haiku for all agents

| Agent | Tokens/run | Runs/week | Justification |
|---|---|---|---|
| Orchestrator | ~500 | 10,080 (every 60s) | Heartbeat reads checkpoint table, queries pending work—ultra-light loop |
| Planner | ~2,000 | 1 (quarterly) + 4 GTM updates | Heavy context reading (strategy docs), light generation (work items) |
| Engineer | ~5,000–8,000 | ≤20 (1–2 per week) | Code work itself is local; Claude reads specs, reviews code, writes functions |
| Reviewer | ~3,000–5,000 | ≤20 (1–2 per work item) | `/code-review` is the heavy lift; Haiku sufficient for Convex guidelines scope |
| Integrator | ~2,000 | 1–2 per wave | Schema/wire-up validation; reads lane docs, tests APIs |
| Analyst | ~1,500 | 1 (weekly) + 1 (quarterly) | Metrics ingestion + trend analysis; dashboards are Convex queries, not Claude |

**Total budget:** ~50k tokens/week baseline. Wave launches (high architect/review activity) spike to ~100k. Still within Haiku's tier.

---

## Bootstrap sequence

1. **Orchestrator** boots, registers itself via `registerAgent()`
2. Orchestrator calls `getAgentsByRole()` to discover other agents
3. **Planner** registers, reads STRATEGY.md + PLAYBOOK.md, calls `createWorkItem()` for next batch
4. **Engineer fleet** (6 instances) registers, each claims work via `claimWorkItem()`
5. **Reviewer** registers, watches for completed work items
6. **Integrator** and **Analyst** register; wait for triggers

All agents log startup checkpoints.

---

## Example: Auth lane shipping (Wave 1)

**Day 1 — Planner runs (quarterly review output):**
```
createWorkItem(
  workType="planning",
  lane="auth",
  title="Auth: implement TOTP + backup codes",
  priority="high",
  dependencies=[]  // Auth has no lane deps
)
```

**Day 2–7 — Engineer-Spine claims and implements:**
```
claimWorkItem(workItemId)
// Writes code, tests locally
logCheckpoint(agent="engineer-spine", message="TOTP flow implemented, 12 tests passing")
updateWorkItemProgress(
  workItemId,
  "completed",
  { summary: "TOTP + backup codes MFA", output: "[PR #123](...)" }
)
```

**Day 8 — Reviewer validates:**
```
getWorkItemDependencies(workItemId)  // No blockers
// Runs /code-review on PR #123
// Checks Convex validator rules (convex/_generated/ai/guidelines.md)
updateWorkItemProgress(
  workItemId,
  "completed",  // or "failed" with feedback
  { summary: "Approved. Convex patterns clean, test coverage 95%." }
)
```

**Day 9 — Integrator wires into Automations:**
```
createWorkItem(
  workType="integration",
  lane="automations",
  title="Wire Auth MFA events → Automations trigger",
  dependencies=[authMFAWorkItemId]
)
```

**Analyst watches weekly:**
```
recordLaneMetric(lane="auth", metric="signups", value=50)
recordLaneMetric(lane="auth", metric="activated", value=20)  // 40% target met
logCheckpoint(
  agent="analyst",
  message="Auth activation 40%, growth gate: PASS (QoQ +15%)"
)
```

---

## Fault tolerance & recovery

### Agent crash
- Orchestrator heartbeat detects missing check-in (agent not logged in 2 cycles)
- Logs `error` checkpoint, marks claimed work items as `failed` (claimedBy agent expired)
- Work re-queues to `pending` for another agent to claim

### Deadlock (circular dependencies)
- Orchestrator detects during each heartbeat
- Logs critical error: `"Deadlock: work items [A, B, C] block each other"`
- Escalates to human (via checkpoint log + Claude Code alert)

### Data corruption
- Never happens—Convex transactions are atomic
- If an agent crashes mid-write, Convex rolls back
- Work item state is either old or new; never corrupt

---

## Metrics dashboard (queryable from Convex)

Query `laneMetrics` to build dashboards:
- **Per-lane KPIs:** Signups, activated, paid, MRR, churn
- **Gate status:** Growth gate (pass/fail), synergy score (0–3), maintainer test (pass/fail)
- **Work velocity:** Items completed/week per lane, avg cycle time
- **Agent health:** Heartbeats per agent, error rate, task claims/complete ratio

---

## Next steps

1. **Deploy the schema** (`convex/schema.ts` + `convex/agent-coordination.ts`)
2. **Create agent code** (6 Haiku instances in Claude Code agents, one per role)
3. **Test with Auth lane** (Wave 1 priority)
4. **Measure:** Orchestrator heartbeat latency, reviewer turnaround, gate accuracy
5. **Iterate:** Refine agent prompts based on checkpoint logs

---

*Agent System — Designed for scale across 15 lanes, token-efficient (all Haiku), coordinated through shared Convex schema.*
