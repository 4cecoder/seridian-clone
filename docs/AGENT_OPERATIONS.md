# Agent Operations — Launching & Managing the Fleet

> **Purpose:** How to spawn, monitor, and operate the six Haiku agents that comprise Seridian's software engineering gauntlet.
>
> **Audience:** Whoever coordinates agent launches (typically the human orchestrator + automated crons).

## Quick start: Launch all agents

```bash
# 1. Deploy the schema & Convex functions
bunx convex deploy

# 2. In Claude Code terminal, spawn the fleet (sequential or parallel)
# Each agent is a Haiku instance with its own context
/agent-orchestrator
/agent-planner
/agent-engineer-spine
/agent-engineer-forms
/agent-engineer-crm
/agent-engineer-publish
/agent-engineer-design
/agent-engineer-trust
/agent-reviewer
/agent-integrator
/agent-analyst

# That's it. Agents heartbeat into Convex; monitor via:
# /monitor-agents (shows live checkpoints)
```

## Agent lifecycle

### Startup (5–10 minutes total)

1. **Orchestrator** boots first
   - Registers itself via `registerAgent(role="orchestrator")`
   - Logs `heartbeat` checkpoint every 60s
   - Checks `agentConfig` for other agents

2. **Other agents** boot (parallel or staggered)
   - Each calls `registerAgent()` with its role + lanes
   - Logs `task_start` checkpoint once ready

3. **Orchestrator** discovers the fleet
   - Calls `getAgentsByRole()` to list active agents
   - Begins assigning work from `getPendingWork()`

### Steady state (continuous)

- **Orchestrator:** Heartbeat every 60s, assign pending work
- **Engineers:** Claim work, implement, mark done
- **Reviewer:** Watch for completed items, validate
- **Integrator:** Trigger on wave launches
- **Analyst:** Weekly metrics sync

### Shutdown (graceful)

```
Any agent:
  1. Finish current work item (or abandon & mark failed)
  2. Log `heartbeat` with `active=false` intent
  3. Exit cleanly

Orchestrator detects missing heartbeat after 2 cycles (120s) → marks agent inactive
```

---

## Agent types & how to spawn them

### 1. Orchestrator (singleton, always-on loop)

```
Command: /agent-orchestrator
Context: Full repo + Convex API reference
Loop: Every 60s or triggered
Duration: Runs until manually stopped
Budget: ~500 tokens/heartbeat
```

**What it does each cycle:**
- Call `getAgentsByRole()` → discover active agents + capacity
- Call `getPendingWork(limit=20)` → scan unassigned work
- For each pending item with blockers clear → assign to available engineer
- Call `getWorkItemDependencies()` → detect deadlocks, escalate
- Log checkpoint with count of items assigned, errors, etc.

**When to stop:**
- During maintenance (deploy new Convex schema)
- Weekly rotation (let another orchestrator take over)
- On detection of deadlock (manual investigation required)

---

### 2. Planner (triggered, quarterly)

```
Command: /agent-planner
Context: STRATEGY.md, PLAYBOOK.md, GTM_FIRST_1K.md, RESEARCH.md + Convex queries
Trigger: End of quarter, or manual `/agent-planner quarterly`
Duration: 10–30 minutes (reads docs, scores gates, creates work items)
Budget: ~2,000 tokens
```

**Quarterly flow:**
1. Read STRATEGY.md five gates, current lane scores
2. Query `agentCheckpoints` → get Analyst's gate verdicts from past quarter
3. Read scorecard data from `laneMetrics` table
4. Re-score each of 15 lanes (Gate 1–5)
5. Determine verdicts: LANE, FEATURE, or DON'T BUILD
6. Create work items for outcomes (e.g., "Fold Blog into Docs", "Unblock Vault security review")
7. Log checkpoint: "Q4 re-score complete: 12 lanes reconfirmed, Blog fold candidate, Vault security-gated"

**GTM update flow** (triggered mid-quarter if Wave 1 MRR hits threshold):
1. Query `laneMetrics` for latest MRR
2. Check Wave 1 → Wave 2 gates (PLAYBOOK.md)
3. If MRR ≥$500 + activation ≥40%: create work items for Wave 2 lanes
4. Log: "Wave 1 gates passed: MRR $550, activation Auth 42%. Unblocking Wave 2: Automations, Sign"

---

### 3. Engineer (fleet of 6, triggered per work item)

Each engineer is spawned once per claimed work item and owns one subsystem.

```
Command: /agent-engineer-{subsystem}
Context: Full repo, subsystem lane code, work item details
Trigger: Orchestrator assigns work OR manual spawn
Duration: Varies (1hr–2 days per feature)
Budget: ~5,000–8,000 tokens per feature
```

**Subsystems:**
- `engineer-spine` → Auth, Mail, API, Status
- `engineer-forms` → Forms, Form-to-CRM integration
- `engineer-crm` → CRM, Help (feature of CRM)
- `engineer-publish` → Blog, Docs, publishing widgets
- `engineer-design` → Designs, Designs canvas engine
- `engineer-trust` → Sign, Vault (when unheld)

**Workflow:**
1. Fetch work item from Convex: `getWorkItemDependencies(workItemId)`
2. If blockers exist: pause, wait for orchestrator signal
3. Claim item: `claimWorkItem(workItemId, agentId="engineer-spine")`
4. Read item description, dependencies, any prior feedback
5. Implement feature locally
6. Run tests: `bun run lint`, `bunx tsc --noEmit`, `bun run build`
7. Commit with attribution
8. Update item: `updateWorkItemProgress(workItemId, "completed", result={...})`
9. Log checkpoint: "Feature X implemented, tests passing, PR #123"

**Signals to watch:**
- If claim fails (item already claimed): skip, log error, exit
- If item marked as `failed` with feedback from reviewer: read feedback, retry
- If dependency item fails: log blocker, mark own work as blocked (don't proceed)

---

### 4. Reviewer (singleton, triggered)

```
Command: /agent-reviewer
Context: Full repo, Convex guidelines, AGENTS.md style rules
Trigger: When engineer marks work "completed"
Duration: 10–30 minutes per feature
Budget: ~3,000–5,000 tokens per review
```

**Workflow:**
1. Poll `getWorkItemDependencies()` → find recent completed items
2. For each: read item result (PR link, summary)
3. Run `/code-review` on the PR/diff
4. Check against:
   - Convex patterns (convex/_generated/ai/guidelines.md)
   - Seridian rules (AGENTS.md, BRANDING.md)
   - Test coverage
   - House style (no internal stack naming in copy, etc.)
5. If approved: `updateWorkItemProgress(workItemId, "completed")`
   - Log: "Approved. Auth MFA tests 95% coverage, Convex validators clean."
   - Unblocks downstream work
6. If blocked: `updateWorkItemProgress(workItemId, "failed", result={feedback})`
   - Log: "Blocked on: (1) test coverage <90%, (2) naming 'convex' in docs"
   - Re-queues to engineer

---

### 5. Integrator (singleton, triggered post-launch)

```
Command: /agent-integrator
Context: Full repo, lane BUSINESS.md + FLOWS.md, widget APIs, Sites codebase
Trigger: Reviewer approves a lane launch (e.g., Auth ready to ship)
Duration: 2–4 hours per lane
Budget: ~2,000 tokens
```

**Workflow:**
1. Fetch completed launch work items: `getWorkStatus(lane="auth")`
2. Read lane docs: BUSINESS.md, FLOWS.md
3. Validate composition:
   - Auth entitlements → readable by other lanes?
   - Mail templates → available in Forms, CRM, etc.?
   - API events → wired into Automations?
   - Widget APIs (Blog, Sched, Forms) → match Sites consumer contract?
4. Test wire-up:
   - Can Forms read Auth entitlements?
   - Can Automations trigger on lane events?
   - Can Sites embed widget?
5. Update ECOSYSTEM.md + lane SITEMAP if APIs changed
6. Create follow-up work items:
   - If Sites needs widget update: `createWorkItem(workType="implementation", lane="sites", title="Update Forms widget consumer")`
7. Log: "Auth integration validated. Entitlements readable, Mail templates exported, Automations triggers wired."

---

### 6. Analyst (singleton, weekly + quarterly)

```
Command: /agent-analyst
Context: STRATEGY.md, GTM_FIRST_1K.md, PLAYBOOK.md + Convex queries
Trigger: Every Monday 9am (cron) or `/agent-analyst weekly`
Duration: 20–40 minutes per run
Budget: ~1,500 tokens
```

**Weekly workflow:**
1. Ingest scorecard: read GTM_FIRST_1K.md template section "Weekly scorecard"
2. Record metrics via `recordLaneMetric()`:
   - Per lane: signups, activated, activation %, paid, MRR, churn
3. Calculate gate status (PLAYBOOK.md):
   - **Growth gate:** (activated_now - activated_week_ago) / activated_week_ago ≥ 10% AND ≥1 new paid customer?
   - **Synergy score:** lanes consumes ≥2 spine services + feeds ≥1 other = 3
   - **Solo-maintainer:** (manual check from ops) — can one person keep it green?
4. Log checkpoint: "Auth growth gate: PASS (activated +15% QoQ, 2 new paid). Forms activation 35%, target 50%, MONITOR."
5. Query `laneMetrics` to plot trends, detect anomalies
6. If gate failure: `createWorkItem(workType="analysis", title="Forms activation low: investigate why")`

**Quarterly workflow:**
- Same as above, but also:
- Prepare scorecard history for Planner's quarterly re-score
- Flag fold candidates: "Blog signups flat 3 quarters, moat = none → fold target"
- Create work item: "Q4 planning: blog fold investigation"

---

## Monitoring the fleet

### Query checkpoint logs (live telemetry)

```typescript
// In Claude Code, read Convex checkpoints:
const checkpoints = await ctx.db
  .query("agentCheckpoints")
  .withIndex("by_agent_and_timestamp", (q) => q.eq("agent", "orchestrator"))
  .order("desc")
  .take(20);
// Last 20 orchestrator heartbeats: timestamps, error counts, items assigned
```

Or via Claude Code command:
```bash
/monitor-agents  # Shows last 10 checkpoints per agent
/monitor-agents agent=orchestrator  # Shows orchestrator only
```

### Query work status

```bash
/work-status  # Shows pending/claimed/in-progress/completed/failed counts
/work-status lane=auth  # Shows Auth lane work breakdown
```

---

## Common scenarios

### Scenario A: Feature stalls (work item stuck in in_progress)

**Signal:** Engineer claimed item 3 hours ago, no progress checkpoint logged.

**Response:**
1. Check agent heartbeat: is the engineer still alive?
   - If no heartbeat in 2 cycles: mark claimed work as failed, re-queue
   - If heartbeat present: agent is alive but quiet—wait longer (could be stuck on a hard problem)
2. Manual intervention: `/agent-engineer-spine --work-item <id> --resume` to restart
3. If truly stuck: mark as failed with "timeout" → engineer reads feedback, tries again

### Scenario B: Deadlock detected (Orchestrator logs critical error)

**Signal:** "Deadlock: work items [A, B, C] block each other"

**Response:**
1. Orchestrator logs the cycle with deadlock flag
2. Human reads the checkpoint log, sees which items form the loop
3. **Fix:** Re-examine dependencies, break the loop (usually means a dependency was wrong)
4. **Prevent:** Planner validates dependency DAG during work creation

### Scenario C: Reviewer blocks feature (feedback logged)

**Signal:** Work item status = "failed", result.summary = "Blocked on: test coverage 75%, target 90%"

**Response:**
1. Engineer reads feedback in work item result
2. Implements fixes (writes more tests)
3. Re-runs locally: `bun run test` (if test suite exists; currently not configured)
4. Updates work item: `updateWorkItemProgress(workItemId, "in_progress")` (re-claim if needed)
5. When fixed: `updateWorkItemProgress(workItemId, "completed")`

### Scenario D: Wave 1 MRR hits $500 (unblock Wave 2)

**Signal:** Analyst logs checkpoint "Wave 1 MRR $500, activation ≥40%: gates passed"

**Response:**
1. Orchestrator (or manual trigger) spawns Planner mid-quarter
2. Planner re-reads PLAYBOOK.md revenue gates
3. Planner creates work items: "Wave 2: Setup Automations lane", "Wave 2: Setup Sign lane"
4. Engineer fleet picks up Wave 2 work
5. Integrator validates wire-up after launch

---

## Emergency stops

```bash
# Stop specific agent
/agent-orchestrator --stop

# Stop entire fleet
/fleet-stop

# Stop and drain (finish current work, then stop)
/fleet-stop --drain

# After maintenance (e.g., schema deploy), restart
bunx convex deploy
/agent-orchestrator  # Restarts fresh
```

---

## Cost tracking

All agents are Haiku. Approximate costs per context:

| Agent | Tokens | Frequency | Cost/week |
|---|---|---|---|
| Orchestrator | ~500 | 10,080 (every 60s) | ~$1.26/week |
| Planner | ~2,000 | 1 quarterly + 4 GTM | ~$0.02/week |
| Engineer (6×) | 5,000–8,000 | 2–3/week | ~$0.20/week |
| Reviewer | 3,000–5,000 | 2–3/week | ~$0.10/week |
| Integrator | 2,000 | 1 per wave launch | ~$0.00/week (batch cost) |
| Analyst | 1,500 | 1/week + 1/quarter | ~$0.02/week |

**Total:** ~$1.6/week + engineer surge during launches (~$5–10/week).

---

## Next steps

1. Deploy the schema: `bunx convex deploy`
2. Spawn orchestrator: `/agent-orchestrator`
3. Create first work item manually: `createWorkItem(workType="planning", lane="auth", title="Implement TOTP MFA")`
4. Spawn engineer: `/agent-engineer-spine` → claims & implements
5. Monitor via `/monitor-agents`

---

*Operations manual — Keep agents alive, watch checkpoints, intervene on deadlocks.*
