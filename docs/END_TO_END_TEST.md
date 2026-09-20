# End-to-End Agent System Test

> **Goal:** Walk through a complete work item lifecycle from creation → claim → implementation → review → completion.
>
> **Time:** ~15 minutes
>
> **Prerequisites:** Convex deployed, system bootstrapped (see DEPLOYMENT_GUIDE.md)

## The scenario

We're testing the Auth lane with the pre-seeded test work item: **"Auth TOTP implementation"**.

This item:
- **Type:** Implementation
- **Lane:** Auth
- **Title:** TEST ITEM: Auth TOTP implementation
- **Description:** Add TOTP (Time-based One-Time Password) + backup codes to Auth MFA

## Test flow

### Phase 1: Find the work item (2 min)

Get pending work in the Auth lane:

```bash
bunx convex run agent_coordination:getPendingWork '{"lane": "auth", "limit": 5}'
```

**Output:**
```json
[
  {
    "_id": "abc123xyz",
    "workType": "implementation",
    "lane": "auth",
    "title": "TEST ITEM: Auth TOTP implementation",
    "status": "pending",
    "priority": "high",
    "dependencies": [],
    "blockedBy": [],
    "createdAt": 1726920000000,
    "updatedAt": 1726920000000
  },
  { ... other auth work items ... }
]
```

**Copy the `_id`** (e.g., `abc123xyz`).

### Phase 2: Engineer claims the work (2 min)

Simulate an engineer (spine subsystem) claiming the work:

```bash
bunx convex run agent_coordination:claimWorkItem '{
  "workItemId": "abc123xyz",
  "agentId": "engineer-spine-test-001"
}'
```

**Expected output:**
```json
{
  "itemId": "abc123xyz",
  "claimedAt": 1726920060000
}
```

**Verification:** Work item status changes from `pending` → `claimed`:

```bash
bunx convex run agent_coordination:getPendingWork '{"lane": "auth", "limit": 5}'
# (The item won't appear anymore—it's claimed)
```

**Checkpoint log:**

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-test-001",
  "checkpointType": "task_start",
  "message": "Claimed Auth TOTP work item. Reading Convex guidelines and spec now.",
  "laneContext": "auth",
  "metrics": {"itemId": "abc123xyz"}
}'
```

### Phase 3: Engineer starts implementation (3 min)

Engineer marks the work in progress:

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "abc123xyz",
  "status": "in_progress"
}'
```

**Expected output:**
```json
{
  "updated": true
}
```

**Progress checkpoint:**

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-test-001",
  "checkpointType": "task_start",
  "message": "Started Auth TOTP implementation. Validators written, tests in progress.",
  "laneContext": "auth",
  "metrics": {
    "filesChanged": 3,
    "linesAdded": 150,
    "testCases": 8
  }
}'
```

### Phase 4: Engineer completes work (2 min)

Engineer finishes implementation and marks work complete:

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "abc123xyz",
  "status": "completed",
  "result": {
    "summary": "Implemented TOTP + backup codes with full Convex validator coverage",
    "output": "GitHub PR #456: https://github.com/bytecats/seridian/pull/456",
    "metrics": {
      "filesChanged": 4,
      "linesAdded": 250,
      "testsCoverage": 95,
      "lintScore": 100
    }
  }
}'
```

**Expected output:**
```json
{
  "updated": true,
  "completedAt": 1726920180000
}
```

**Completion checkpoint:**

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "engineer-spine-test-001",
  "checkpointType": "task_complete",
  "message": "Auth TOTP complete. PR #456 ready for review. All tests passing (95% coverage), ESLint clean.",
  "laneContext": "auth",
  "metrics": {
    "hoursSpent": 3,
    "testsCoverage": 95,
    "prLink": "#456"
  }
}'
```

### Phase 5: Reviewer validates (3 min)

Reviewer reads the completed work:

```bash
bunx convex run agent_coordination:getWorkItemDependencies '{"workItemId": "abc123xyz"}'
```

**Output shows:**
```json
{
  "item": {
    "_id": "abc123xyz",
    "status": "completed",
    "result": {
      "summary": "...",
      "output": "GitHub PR #456: ...",
      "metrics": { ... }
    }
  },
  "dependencies": [],
  "blockedBy": [],
  "canStart": false
}
```

Reviewer runs code review (simulated):

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "reviewer-test-001",
  "checkpointType": "task_start",
  "message": "Reviewing Auth TOTP PR #456. Checking Convex patterns and test coverage.",
  "laneContext": "auth"
}'
```

**After review**, reviewer approves:

```bash
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "abc123xyz",
  "status": "completed",
  "result": {
    "summary": "✅ APPROVED. Convex validators clean, test coverage 95%, house style compliant. Ready for integration."
  }
}'
```

**Approval checkpoint:**

```bash
bunx convex run agent_coordination:logCheckpoint '{
  "agent": "reviewer-test-001",
  "checkpointType": "task_complete",
  "message": "Auth TOTP approved. Validators per guidelines, 95% test coverage, naming OK. Cleared for merge.",
  "laneContext": "auth"
}'
```

### Phase 6: Resolve blocked work (1 min)

If any work items were blocked by this one, unblock them:

```bash
bunx convex run agent_state:resolveBlockedItems '{"completedItemId": "abc123xyz"}'
```

**Output:**
```json
{
  "unblocked": 0
  // (None were blocked by the auth item in this test)
}
```

### Phase 7: Monitor the complete flow (2 min)

**Check work status:**

```bash
bunx convex run agent_coordination:getWorkStatus '{"lane": "auth"}'
```

**Output:**
```json
{
  "total": 3,
  "byStatus": {
    "pending": 2,
    "claimed": 0,
    "in_progress": 0,
    "completed": 1,
    "failed": 0
  }
}
```

**Check fleet health:**

```bash
bunx convex run agent_monitoring:getFleetStatus '{}'
```

**Output:**
```json
{
  "timestamp": 1726920240000,
  "fleet": {
    "totalAgents": 11,
    "activeAgents": 11,
    "byRole": {
      "orchestrator": 1,
      "reviewer": 1,
      "integrator": 1,
      "analyst": 1,
      "engineer": 6,
      "planner": 1
    }
  },
  "work": {
    "pending": 17,
    "claimed": 0,
    "in_progress": 0,
    "completed": 1,
    "failed": 0
  },
  "agents": { ... }
}
```

**Check work velocity:**

```bash
bunx convex run agent_monitoring:getWorkVelocity '{"daysBack": 1}'
```

**Output:**
```json
{
  "period": { "days": 1, "cutoff": 1726833840000 },
  "summary": {
    "completed": 1,
    "failed": 0,
    "inProgress": 0,
    "completionRate": "1 items/day",
    "successRate": 100
  },
  "byLane": {
    "auth": { "completed": 1, "failed": 0 }
  }
}
```

**Check checkpoints (audit trail):**

```bash
bunx convex run agent_coordination:getAgentHeartbeats '{"agent": "engineer-spine-test-001", "limit": 10}'
```

**Output shows the engineer's activity log:**
```json
[
  {
    "agent": "engineer-spine-test-001",
    "checkpointType": "task_complete",
    "message": "Auth TOTP complete. PR #456 ready for review...",
    "timestamp": 1726920180000
  },
  {
    "agent": "engineer-spine-test-001",
    "checkpointType": "task_start",
    "message": "Started Auth TOTP implementation...",
    "timestamp": 1726920060000
  },
  {
    "agent": "engineer-spine-test-001",
    "checkpointType": "task_start",
    "message": "Claimed Auth TOTP work item...",
    "timestamp": 1726920000000
  }
]
```

## Summary

The complete test demonstrates:

✅ **Work discovery** — pending items queryable by lane  
✅ **Exclusive claiming** — only one agent can claim an item  
✅ **State transitions** — pending → claimed → in_progress → completed  
✅ **Results storage** — PR link, metrics, summary persisted  
✅ **Checkpointing** — audit trail of every action  
✅ **Review workflow** — second agent can validate + approve  
✅ **Fleet visibility** — orchestrator sees all agents + work  
✅ **Metrics tracking** — completion rate, success rate, per-lane breakdown  
✅ **Dependency resolution** — blocked items unblock when deps complete  

## What to verify

- [ ] Work item found in pending queue
- [ ] Engineer claim succeeds on first try, fails on second (exclusive)
- [ ] Status changes visible in real time
- [ ] Reviewer can read claimed work + approve
- [ ] Checkpoints form an audit trail
- [ ] Fleet status shows 11 agents active
- [ ] Work velocity shows 1 completed, 100% success rate
- [ ] All Convex writes atomic (no partial updates on failure)

## Next steps

1. **Test error cases:** Engineer marks as `failed` with feedback → work re-queues
2. **Test deadlocks:** Create circular dependencies, verify detection
3. **Test timeouts:** Mark item claimed >2 hours ago, verify stuck detection
4. **Test waves:** Planner creates Wave 2 work when Wave 1 gates pass
5. **Test integrator:** After Auth approval, integrator validates entitlements readable

---

*End-to-end test complete. System ready for real agent deployments.*
