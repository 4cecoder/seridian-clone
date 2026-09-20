# Agent System Deployment Guide

> **Goal:** Get the Seridian agent system running end-to-end in < 30 minutes.

## Prerequisites

- `bun` installed (project uses bun 1.4.0)
- Convex CLI: `bunx convex auth` (already authenticated)
- Working directory: `/Users/fource/bytecats/adventurers/seridian-systems/seridian`

## Step 1: Deploy Convex schema + functions (5 min)

```bash
cd /Users/fource/bytecats/adventurers/seridian-systems/seridian

# Deploy schema + all agent functions
bunx convex deploy

# Output: ✓ Functions deployed
#         ✓ Schema deployed
```

This deploys:
- Schema extensions: `agentWorkItems`, `agentCheckpoints`, `laneMetrics`, `agentConfig`
- Agent coordination APIs: `convex/agent-coordination.ts`
- Agent launchers: `convex/agent-launcher.ts`
- State machine logic: `convex/agent-state.ts`
- Bootstrap + seeding: `convex/agent-bootstrap.ts`
- Monitoring queries: `convex/agent-monitoring.ts`

## Step 2: Bootstrap the system (2 min)

In Claude Code terminal (or via HTTP):

```bash
# Option A: Via Claude Code terminal (easiest)
bunx convex run agent_bootstrap:bootstrapSystem '{"includeTestItem": true}'

# Output: {
#   bootstrapComplete: true,
#   timestamp: 1726920000000,
#   steps: [
#     { initialized: true, markerId: "..." },
#     { seeded: true, itemsCreated: 18, items: [...] },
#     { benchmarksCreated: 10, metrics: [...] }
#   ],
#   summary: {
#     registryInitialized: true,
#     workItemsSeeded: 18,
#     benchmarksSeeded: 10
#   }
# }
```

What this does:
- Initializes agent registry (marks system as bootstrapped)
- Seeds work items: 15 lane planning tasks + 3 fold investigations + 1 test item
- Seeds metric benchmarks (activation targets, growth gates, etc.)

## Step 3: Launch the agent fleet (3 min)

Each agent is a Haiku instance. Launch in order:

```bash
# 1. Orchestrator (singleton, persistent heartbeat loop)
bunx convex run agent_launcher:launchOrchestrator '{}'

# 2. Reviewer (watches for completed work)
bunx convex run agent_launcher:launchReviewer '{}'

# 3. Integrator (validates composition after launches)
bunx convex run agent_launcher:launchIntegrator '{"lane": null}'

# 4. Analyst (weekly metrics ingestion)
bunx convex run agent_launcher:launchAnalyst '{"interval": "weekly"}'

# 5. Engineer fleet (6 subsystems)
bunx convex run agent_launcher:launchEngineer '{"subsystem": "spine", "workItemId": "PLACEHOLDER_ID"}'
bunx convex run agent_launcher:launchEngineer '{"subsystem": "forms", "workItemId": "PLACEHOLDER_ID"}'
bunx convex run agent_launcher:launchEngineer '{"subsystem": "crm", "workItemId": "PLACEHOLDER_ID"}'
bunx convex run agent_launcher:launchEngineer '{"subsystem": "publish", "workItemId": "PLACEHOLDER_ID"}'
bunx convex run agent_launcher:launchEngineer '{"subsystem": "design", "workItemId": "PLACEHOLDER_ID"}'
bunx convex run agent_launcher:launchEngineer '{"subsystem": "trust", "workItemId": "PLACEHOLDER_ID"}'

# 6. Planner (quarterly planning)
bunx convex run agent_launcher:launchPlanner '{"context": "quarterly"}'
```

Or launch all at once:

```bash
bunx convex run agent_launcher:launchAllAgents '{}'
```

**Output:** List of launched agents with IDs and timestamps.

## Step 4: Monitor agent activity (live)

Query the fleet status:

```bash
bunx convex run agent_monitoring:getFleetStatus '{}'

# Output:
# {
#   timestamp: 1726920000000,
#   fleet: {
#     totalAgents: 11,
#     activeAgents: 11,
#     byRole: {
#       orchestrator: 1,
#       reviewer: 1,
#       integrator: 1,
#       analyst: 1,
#       engineer: 6,
#       planner: 1
#     }
#   },
#   work: {
#     pending: 16,
#     claimed: 1,
#     in_progress: 1,
#     completed: 0,
#     failed: 0
#   },
#   agents: { ... }
# }
```

Check dashboard:

```bash
bunx convex run agent_monitoring:getDashboardSummary '{}'

# Shows: Fleet count, work by status, recent errors, uptime
```

Check for heartbeats:

```bash
bunx convex run agent_monitoring:getAgentHeartbeatStatus '{"minutesBack": 5}'

# Shows which agents are alive + their last message
```

## Step 5: Simulate work flow (end-to-end test)

### 5a. Get the test work item ID

```bash
bunx convex run agent_coordination:getPendingWork '{"lane": "auth", "limit": 5}'

# Look for: "TEST ITEM: Auth TOTP implementation"
# Copy its _id (e.g., "auth-test-123xyz")
```

### 5b. Engineer claims the work

```bash
bunx convex run agent_coordination:claimWorkItem '{"workItemId": "auth-test-123xyz", "agentId": "engineer-spine-123"}'

# Output: { itemId: "...", claimedAt: timestamp }
```

### 5c. Engineer marks in progress + logs checkpoint

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "auth-test-123xyz",
  "status": "in_progress"
}'

bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-123",
  "checkpointType": "task_start",
  "message": "Started Auth TOTP feature. Reading Convex guidelines now."
}'
```

### 5d. Engineer completes work

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "auth-test-123xyz",
  "status": "completed",
  "result": {
    "summary": "Implemented TOTP + backup codes per Convex guidelines",
    "output": "PR #123: Added v.validators for all functions, 95% test coverage",
    "metrics": {
      "filesChanged": 4,
      "testsCoverage": 95
    }
  }
}'

bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-123",
  "checkpointType": "task_complete",
  "message": "Auth TOTP complete. PR #123, tests passing, ready for review."
}'
```

### 5e. Reviewer approves

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "auth-test-123xyz",
  "status": "completed",
  "result": {
    "summary": "✅ Approved. Convex patterns clean, test coverage 95%, house style OK."
  }
}'

bunx convex run agent_coordination:logCheckpoint '{
  "agent": "reviewer-123",
  "checkpointType": "task_complete",
  "message": "Auth TOTP approved. Ready for integration."
}'
```

### 5f. View the work item's journey

```bash
bunx convex run agent_state:getWorkDependencyTree '{"workItemId": "auth-test-123xyz"}'

# Shows: Status transitions, who claimed it, result, timeline
```

## Step 6: Check velocity + health

Work completed this week:

```bash
bunx convex run agent_monitoring:getWorkVelocity '{"daysBack": 7}'

# Output:
# {
#   summary: {
#     completed: 1,
#     failed: 0,
#     inProgress: 1,
#     completionRate: "0.14 items/day",
#     successRate: 100
#   },
#   byLane: { auth: { completed: 1, failed: 0 }, ... }
# }
```

Errors in past 24 hours:

```bash
bunx convex run agent_monitoring:getAgentErrors '{"hoursBack": 24}'

# Shows: error count, agent, timestamp, message
```

## Troubleshooting

### Agent not appearing in fleet status

**Symptom:** Launched agent but `getFleetStatus()` doesn't show it.

**Fix:**
1. Check if `registerAgent()` succeeded (should see `task_start` checkpoint)
2. If checkpoint missing: agent may have crashed on startup
3. Check `getAgentHeartbeatStatus()` to see recent checkpoints

### Work item stuck in "claimed"

**Symptom:** Item claimed >2 hours ago, still in-progress, no progress checkpoint.

**Fix:**
```bash
bunx convex run agent_state:getWorkItemsStuck '{"hoursThreshold": 2}'

# Then mark failed:
bunx convex run agent_state:markStuckItemsFailed '{"hoursThreshold": 2}'

# Item re-queues to pending
```

### Deadlock detected

**Symptom:** Orchestrator logs "Deadlock detected"

**Fix:**
```bash
bunx convex run agent_state:detectDeadlocks '{"limit": 10}'

# Identify which items are circular
# Either break the dependency chain or reassign work items
```

### Reset system for re-testing

```bash
bunx convex run agent_bootstrap:resetSystemForTesting '{}'

# Deletes all work items, checkpoints, metrics, agent configs (except bootstrap marker)
# Then run bootstrap again
```

## What to expect

After deployment + bootstrap + agent launch:

1. **Orchestrator** heartbeats every 60s
2. **Work items** available in pending queue
3. **Engineers** can claim work, update status, log checkpoints
4. **Reviewer** can approve/block completed work
5. **Analyst** can ingest metrics, calculate gates
6. **Integrator** can validate composition after launches
7. **Monitoring** queries show fleet status, work velocity, errors

All data persists in Convex. No agent needs external state storage.

## Next steps (after validation)

1. Wire up actual agent implementations (from AGENT_BLUEPRINTS.md)
2. Create HTTP endpoints for agent spawning (optional, if building a dashboard)
3. Set up cron jobs for analyst (weekly) + orchestrator heartbeat (every 60s)
4. Integrate with actual code: engineer agents clone repo, run tests, commit
5. Build dashboard UI to visualize fleet status + work items

## Cost estimate

All agents are Haiku (claude-haiku-4-5-20251001):

- Orchestrator: ~$1.26/week (10,080 heartbeats × 500 tokens each)
- Engineers: ~$0.20/week (3 features × 5k–8k tokens)
- Reviewer: ~$0.10/week (2–3 reviews)
- Others: ~$0.04/week (Planner, Analyst, Integrator)
- **Total: ~$1.60/week baseline**

---

*Deployment complete. You now have a running, monitored agent fleet coordinating work through Convex.*
