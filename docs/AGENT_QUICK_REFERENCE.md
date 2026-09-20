# Agent System Quick Reference

## One-line commands

### Deploy

```bash
bunx convex deploy
```

### Bootstrap

```bash
bunx convex run agent_bootstrap:bootstrapSystem '{"includeTestItem": true}'
```

### Launch all agents

```bash
bunx convex run agent_launcher:launchAllAgents '{}'
```

### Fleet status

```bash
bunx convex run agent_monitoring:getFleetStatus '{}'
```

### Dashboard

```bash
bunx convex run agent_monitoring:getDashboardSummary '{}'
```

## Agent roles & what they do

| Role | Frequency | What it does |
|---|---|---|
| **Orchestrator** | Every 60s | Assigns pending work to engineers, detects deadlocks |
| **Planner** | Quarterly + on wave open | Scores gates, creates work items, queues OKRs |
| **Engineer** (6) | Per work item | Implements features, runs tests, marks done |
| **Reviewer** | Per completed item | Reviews code, approves or blocks with feedback |
| **Integrator** | Post-launch | Validates composition, wires new lanes into umbrella |
| **Analyst** | Weekly + quarterly | Ingests metrics, calculates gate status, trends |

## Work item states

```
pending → claimed → in_progress → completed
   ↓        ↓            ↓
   └─ failed (any state, can re-queue as pending)
```

## Key APIs

### Claim work (engineer)

```bash
bunx convex run agent_coordination:claimWorkItem '{
  "workItemId": "ID",
  "agentId": "engineer-spine-123"
}'
```

### Update progress (engineer/reviewer)

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "ID",
  "status": "in_progress|completed|failed",
  "result": {
    "summary": "Done! PR #123",
    "output": "description or link",
    "metrics": {"coverage": 95}
  }
}'
```

### Log checkpoint (all agents)

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-123",
  "checkpointType": "heartbeat|task_start|task_complete|error",
  "message": "What happened",
  "laneContext": "auth",
  "metrics": {"filesChanged": 4}
}'
```

### Get pending work (engineer)

```bash
bunx convex run agent_coordination:getPendingWork '{"lane": "auth", "limit": 5}'
```

### Create work item (planner)

```bash
bunx convex run agent_coordination:createWorkItem '{
  "workType": "planning|analysis|implementation|review|integration|metrics",
  "lane": "auth",
  "title": "Feature X",
  "description": "Do this",
  "priority": "critical|high|medium|low",
  "dependencies": []
}'
```

### Record metric (analyst)

```bash
bunx convex run agent_coordination:recordLaneMetric '{
  "lane": "auth",
  "metric": "signups",
  "value": 50,
  "metadata": {"week": "2024-W40"}
}'
```

## Monitoring

### Fleet status (all agents + work)

```bash
bunx convex run agent_monitoring:getFleetStatus '{}'
```

### Heartbeats (who's alive?)

```bash
bunx convex run agent_monitoring:getAgentHeartbeatStatus '{"minutesBack": 5}'
```

### Errors (debugging)

```bash
bunx convex run agent_monitoring:getAgentErrors '{"hoursBack": 24}'
```

### Work velocity (completed/week)

```bash
bunx convex run agent_monitoring:getWorkVelocity '{"daysBack": 7, "lane": "auth"}'
```

### Work status (by lane)

```bash
bunx convex run agent_monitoring:getWorkItemStatus '{"lane": "auth"}'
```

## State machine

### Can this work start? (check blockers)

```bash
bunx convex run agent_state:canStartWork '{"workItemId": "ID"}'
```

### Find deadlocks

```bash
bunx convex run agent_state:detectDeadlocks '{"limit": 10}'
```

### Find stuck work (>2 hours claimed, no progress)

```bash
bunx convex run agent_state:getWorkItemsStuck '{"hoursThreshold": 2}'
```

### Mark stuck items as failed (timeout)

```bash
bunx convex run agent_state:markStuckItemsFailed '{"hoursThreshold": 2}'
```

### Unblock items when dependency completes

```bash
bunx convex run agent_state:resolveBlockedItems '{"completedItemId": "ID"}'
```

### Full dependency tree (debug work item)

```bash
bunx convex run agent_state:getWorkDependencyTree '{"workItemId": "ID", "depth": 5}'
```

## Common flows

### Engineer picks up work

```bash
# 1. Get pending work
bunx convex run agent_coordination:getPendingWork '{"lane": "auth", "limit": 1}'
# Copy the _id

# 2. Claim it
bunx convex run agent_coordination:claimWorkItem '{
  "workItemId": "THAT_ID",
  "agentId": "engineer-spine-123"
}'

# 3. Start work
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "THAT_ID",
  "status": "in_progress"
}'
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-123",
  "checkpointType": "task_start",
  "message": "Started implementing Auth TOTP"
}'

# 4. Complete work
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "THAT_ID",
  "status": "completed",
  "result": {
    "summary": "Implemented TOTP + backup codes",
    "output": "PR #123",
    "metrics": {"coverage": 95}
  }
}'
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-123",
  "checkpointType": "task_complete",
  "message": "Auth TOTP complete, tests passing"
}'
```

### Reviewer approves

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "THAT_ID",
  "status": "completed",
  "result": {
    "summary": "✅ Approved. Convex patterns clean, 95% coverage."
  }
}'
```

### Planner creates quarterly work

```bash
# For each lane:
bunx convex run agent_coordination:createWorkItem '{
  "workType": "planning",
  "lane": "auth",
  "title": "Q4 gate re-score: auth",
  "description": "Score the five gates per STRATEGY.md",
  "priority": "high"
}'
```

### Analyst records metrics

```bash
bunx convex run agent_coordination:recordLaneMetric '{
  "lane": "auth",
  "metric": "signups",
  "value": 50
}'
bunx convex run agent_coordination:recordLaneMetric '{
  "lane": "auth",
  "metric": "activated",
  "value": 20
}'
bunx convex run agent_coordination:recordLaneMetric '{
  "lane": "auth",
  "metric": "activation_rate",
  "value": 40
}'
```

## Reset for testing

```bash
bunx convex run agent_bootstrap:resetSystemForTesting '{}'
```

Then re-bootstrap:

```bash
bunx convex run agent_bootstrap:bootstrapSystem '{"includeTestItem": true}'
```

---

*Save this page. Use it for CLI commands, API reference, and common flows.*
