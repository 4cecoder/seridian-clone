# Seridian SWE Gauntlet — Deployment & Validation

> **Purpose:** Complete deployment guide for the 10-agent coordinated fleet + comprehensive testing framework.
>
> **Status:** Ready to deploy. Follow this checklist step-by-step.

## Architecture recap

```
┌─────────────────────────────────────────────────────────────┐
│        AGENT COORDINATION LAYER (Convex DB)                 │
│  agentWorkItems | agentCheckpoints | laneMetrics |          │
│  agentConfig (10 agents + testing agents)                   │
└─────────────────────────────────────────────────────────────┘
          ↑              ↑              ↑              ↑
          │              │              │              │
      CORE AGENTS (6)    TESTING AGENTS (4)
     ┌─────────────┐    ┌──────────────┐
     │Orchestrator │    │QA Agent      │ - Coverage tracking
     │Planner      │    │E2E Agent     │ - Customer workflows
     │Engineer×6   │    │Perf Agent    │ - Performance baselines
     │Reviewer     │    │Security Agent│ - OWASP + validation
     │Integrator   │    └──────────────┘
     │Analyst      │
     └─────────────┘
```

**All agents:** Haiku (claude-haiku-4-5-20251001)
**Test environments:** Local (mocked) → Staging (real) → Production (no tests)
**Quality gates:** Coverage ≥80%, E2E 100% pass, Security all checks

---

## Pre-deployment checklist

- [ ] Clone/pull latest code
- [ ] Review AGENT_SYSTEM.md, TEST_STRATEGY.md, this doc
- [ ] Verify `.env.example` doesn't have production keys
- [ ] Ensure staging Convex deployment exists (separate from prod)
- [ ] Have Resend sandbox keys ready (for E2E tests)
- [ ] Have Stripe test keys ready (for E2E tests)

---

## Step 1: Deploy Convex schema & agent functions

```bash
# 1a. Ensure clean working directory
git status

# 1b. Deploy schema extensions + agent Convex functions
bunx convex deploy

# This pushes:
# - Schema: agentWorkItems, agentCheckpoints, laneMetrics, agentConfig
# - Functions: agent_coordination.ts, agent_testing.ts, agent_launcher.ts, etc.
# - HTTP endpoints for agent spawning (if configured)

# Verify deployment succeeded
# Check: convex.cloud dashboard shows new tables + functions deployed
```

**Expected output:**
```
✔ Convex functions updated
✔ Schema migrated
✔ New tables: agentWorkItems, agentCheckpoints, laneMetrics, agentConfig
```

---

## Step 2: Initialize agent system

```bash
# 2a. Bootstrap: Register agents, seed initial work items
bunx convex run agent_bootstrap:bootstrapSystem '{
  "includeTestItem": true
}'

# This creates:
# - Agent configs for Orchestrator, Planner, 6 Engineers, Reviewer, Integrator, Analyst
# - 15 planning work items (one per lane: Auth, Mail, Forms, ..., Vault)
# - 3 fold investigation items (Blog, Help, Vault)
# - 1 test work item (for validation)

# Verify in Convex dashboard:
# - agentConfig: 10 rows (roles: orchestrator, planner, engineer, reviewer, integrator, analyst, qa, e2e, perf, security)
# - agentWorkItems: 19 rows (15 lanes + 3 folds + 1 test)
```

**Expected output:**
```
✔ Bootstrapped 10 agents
✔ Created 19 work items
✔ System ready for launch
```

---

## Step 3: Configure local testing environment

```bash
# 3a. Copy vitest config
cp vitest.config.example.ts vitest.config.ts

# 3b. Ensure test environment detection works
# tests/setup.ts will:
# - Throw error if production keys detected
# - Verify deployment != "production"
# - Set up mocks for Resend, Stripe, S3

# 3c. Install test dependencies (if not already done)
bun install --frozen-lockfile

# Add to package.json if not present:
# "test": "vitest run",
# "test:watch": "vitest",
# "test:coverage": "vitest run --coverage"
```

**Verify:**
```bash
bun run test
# Should run without errors, no production service calls
```

---

## Step 4: Run local unit tests

```bash
# 4a. Run example unit tests (Auth lane)
bun run test tests/examples/auth.unit.example.ts

# Expected: All tests pass (100% mocked, no real services)
# Example output:
#   ✓ tests/examples/auth.unit.example.ts (12 tests) 450ms
#   - Signup flow (2 tests)
#   - Login flow (2 tests)
#   - Token validation (2 tests)
#   - MFA flow (3 tests)
#   - RBAC (3 tests)

# 4b. Check coverage
bun run test:coverage
# Should show coverage per lane vs. targets (TEST_STRATEGY.md)
```

---

## Step 5: Set up staging environment

```bash
# 5a. Create staging Convex deployment (if not exists)
# Via convex.cloud dashboard:
# - Create new deployment "seridian-staging"
# - Link to staging git branch

# 5b. Set up environment variables for staging
# .env.staging:
CONVEX_URL=https://seridian-staging.convex.cloud  # From dashboard
CONVEX_DEPLOYMENT=staging.seridian.dev
RESEND_TEST_API_KEY=re_test_xxxxxxxx              # Sandbox key
STRIPE_TEST_KEY=sk_test_xxxxxxxx                  # Test key
NEXT_PUBLIC_CONVEX_URL=https://seridian-staging.convex.cloud

# ❌ NEVER add production keys here

# 5c. Deploy to staging
CONVEX_DEPLOYMENT=staging.seridian.dev bunx convex deploy

# 5d. Bootstrap staging (separate from local)
CONVEX_DEPLOYMENT=staging.seridian.dev bunx convex run \
  agent_bootstrap:bootstrapSystem '{"includeTestItem": true}'
```

**Verify:**
```bash
# Open https://staging.seridian.dev
# Should see staging environment (different from prod)
# Check Convex dashboard: staging deployment has tables/functions
```

---

## Step 6: Run E2E tests in staging

```bash
# 6a. Install Playwright
bunx playwright install

# 6b. Create playwright.config.ts (if not exists)
# From docs/TEST_STRATEGY.md example

# 6c. Run E2E tests against staging
STAGING_URL=https://staging.seridian.dev \
CONVEX_DEPLOYMENT=staging.seridian.dev \
bunx playwright test tests/examples/auth.e2e.example.ts

# Expected: All flows pass
# This tests real Convex DB + Resend sandbox + integration
# Duration: ~5-10 min (real browser automation)

# Output:
#   ✓ Signup flow (email verification)
#   ✓ Login flow (MFA enabled)
#   ✓ Cross-lane integration: Auth → Forms paywall
#   ✓ RBAC: Organization members and roles
#   ✓ Performance baseline
#   ✓ Error handling
#   ✓ Security: XSS prevention
```

---

## Step 7: Validate quality gates

```bash
# 7a. Run QA validation via Convex
bunx convex run agent_testing:checkQualityGates '{
  "lane": "Auth"
}'

# Expected output:
{
  "lane": "Auth",
  "gates": {
    "coverage": { "target": 95, "actual": 95, "pass": true },
    "e2e": { "target": 100, "actual": 100, "pass": true },
    "security": { "pass": true }
  },
  "blockDeployment": false,
  "summary": "✓ All quality gates pass. Ready for deployment."
}

# 7b. Check fleet-wide quality
bunx convex run agent_testing:getFleetQualityStatus '{}'

# Expected: All 15 lanes healthy (coverage ≥80%, E2E 100%)
# Output:
{
  "total": 15,
  "healthy": 15,
  "healthPercent": 100,
  "lanes": [
    { "lane": "Auth", "coverage": 95, "e2ePassRate": 100, "healthy": true },
    { "lane": "Mail", "coverage": 90, "e2ePassRate": 100, "healthy": true },
    ...
  ]
}
```

---

## Step 8: Launch the agent fleet

```bash
# 8a. Start Orchestrator (heartbeat loop)
bunx convex run agent_launcher:launchOrchestrator '{}'

# Starts every 60s, monitors work queue, assigns work to engineers

# 8b. Launch Planner (quarterly planning)
bunx convex run agent_launcher:launchPlanner '{
  "context": "quarterly"
}'

# Re-scores five gates, creates work items for next quarter

# 8c. Launch Engineer fleet (6 instances, as needed per work item)
# Each engineer claims work, implements, tests, marks done
# Can be triggered manually or by Orchestrator

# 8d. Launch Reviewer
bunx convex run agent_launcher:launchReviewer '{}'

# Watches for completed engineer work, validates, approves

# 8e. Launch QA, E2E, Perf, Security agents
bunx convex run agent_launcher:launchAllTestingAgents '{}'

# All agents begin heartbeating → monitoring system is live
```

**Verify agents are alive:**
```bash
# Query agent checkpoints
bunx convex run agent_monitoring:getAgentHeartbeats '{}'

# Should see recent timestamps for all 10 agents
# Example:
[
  { "agent": "orchestrator", "timestamp": 1726789234000, "message": "3 items assigned..." },
  { "agent": "planner", "timestamp": 1726789200000, "message": "Quarterly planning ready..." },
  { "agent": "engineer-spine", "timestamp": 1726789215000, "message": "Claimed work item #42..." },
  ...
]
```

---

## Step 9: Run end-to-end validation

```bash
# 9a. Manually create a test work item
bunx convex run agent_coordination:createWorkItem '{
  "workType": "implementation",
  "lane": "auth",
  "title": "Test: MFA TOTP feature",
  "priority": "high",
  "dependencies": []
}'

# Returns: { "itemId": "..." }

# 9b. Verify Orchestrator assigns it to an engineer
# Wait 60s (orchestrator heartbeat cycle)
bunx convex run agent_monitoring:getWorkStatus '{"lane": "auth"}'

# Expected:
{
  "total": 1,
  "byStatus": {
    "pending": 0,
    "claimed": 1,    // ✓ Orchestrator assigned it
    "in_progress": 0,
    "completed": 0,
    "failed": 0
  }
}

# 9c. Simulate engineer completing work
# (In real workflow, engineer-spine agent would claim and do this)
# Get the claimed item ID from above, then:

bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "<the claimed ID>",
  "status": "completed",
  "result": {
    "summary": "Implemented TOTP MFA with 12 tests passing",
    "output": "GitHub PR #123",
    "metrics": {"filesChanged": 4, "testsCoverage": "95%"}
  }
}'

# 9d. Verify Reviewer approves it
# (In real workflow, reviewer-primary agent would do this)
# Reviewer marks it "completed" with approval

# 9e. Check work status
bunx convex run agent_monitoring:getWorkStatus '{"lane": "auth"}'

# Expected:
{
  "total": 1,
  "byStatus": {
    "completed": 1    // ✓ Reviewer approved
  }
}

# 9f. Verify quality gate
bunx convex run agent_testing:checkQualityGates '{"lane": "Auth"}'

# Should still pass (coverage 95%, E2E 100%)
```

---

## Step 10: Deploy to production

```bash
# 10a. Verify all quality gates green
bun run test:coverage
bun run test  # All unit tests pass
# E2E tests in staging all pass
# No production key leakage detected

# 10b. Merge to main
git add -A
git commit -m "feat: Deploy complete SWE gauntlet (10 agents + testing framework)

- Agent system: Orchestrator, Planner, Engineers (6), Reviewer, Integrator, Analyst
- Testing agents: QA, E2E, Perf, Security
- Convex schema: agentWorkItems, agentCheckpoints, laneMetrics, agentConfig
- Testing: Unit (mocked), Integration (Convex), E2E (staging + real sandboxes)
- Quality gates: Coverage ≥80%, E2E 100%, Security all checks
- Cost: ~\$1.60/week baseline (all Haiku)"

# 10c. Merge to production
git push origin main

# 10d. Production Convex deploy
bunx convex deploy

# ✓ System now live in production
# - Agents start heartbeating
# - Engineering work begins flowing through the queue
# - Quality gates block deployments unless all tests pass
```

---

## Monitoring & operations

### Daily tasks (automated)

- **Orchestrator:** Heartbeat every 60s, assign work, detect deadlocks
- **Analyst:** Weekly scorecard (Monday 9am), ingest metrics
- **QA Agent:** After every merge, track coverage + flaky tests
- **E2E Agent:** After every feature merge to staging, validate flows

### Weekly tasks

```bash
# Check fleet health
bunx convex run agent_monitoring:getFleetStatus '{}'

# Ingest scorecard from ops tracker
bunx convex run agent_testing:recordTestCoverage '{
  "lane": "Auth",
  "coverage": 95,
  "uncoveredLines": 23
}'

# Review checkpoint logs
bunx convex run agent_monitoring:getAgentHeartbeats '{}'
```

### Monthly tasks

- Review agent error logs (detect patterns)
- Quarterly review cycle (Planner runs full re-score)
- Pricing/GTM updates (if needed)

### Emergency: Deadlock detected

```bash
# 1. Orchestrator logs critical: "Deadlock: items A→B→C→A"
# 2. Human reads checkpoint logs
# 3. Examine work item dependencies
# 4. Fix the dependency issue
# 5. Re-queue affected items

bunx convex run agent_coordination:getWorkStatus '{}'
# Find the deadlocked items, inspect dependencies
```

---

## Success criteria

**After deployment, you have:**

✅ 10 Haiku agents coordinating via shared Convex DB (no persistent state outside DB)
✅ 80%+ test coverage per lane (tracked + enforced by QA agent)
✅ E2E flows validated per lane (Auth signup→login, Forms submit, CRM CRUD, etc.)
✅ Performance baselines established (tracked by Perf agent)
✅ Security validation automated (OWASP, PII, secrets scanning)
✅ Zero production asset usage in tests (Resend/Stripe sandboxes only)
✅ Quality gates block deployment unless all pass (coverage ≥80%, E2E 100%, security ✓)
✅ Cost-optimized: ~$1.60/week baseline (all Haiku), scale to $5-10/week during launches

**Engineering velocity:**
- Work items queued by Planner → Claimed by Engineers → Reviewed → Approved → Production
- Typical cycle: 4-8 hours (implementation) → 30min (review) → Live
- 15 lanes, each shipping with full test suite + quality gates

---

## Troubleshooting

### "Agent not registered"
→ Run bootstrap: `convex run agent_bootstrap:bootstrapSystem`

### "Production key detected in tests"
→ Delete `.env`, use `.env.example`, add production keys only when needed in secure CI

### "E2E tests won't run locally"
→ Expected. E2E tests must run in staging. Set `STAGING_URL=https://staging.seridian.dev`

### "Deadlock in work items"
→ Orchestrator detects this. Check dependencies, fix, re-queue work.

### "Quality gate failed"
→ Merge blocked until gate passes. Engineer fixes code, retries.

---

**System is now ready. Start building the 15-lane umbrella with confidence.** 🚀

*SWE Gauntlet — Every lane ships with 80%+ test coverage, E2E validation, quality gates, and zero production asset usage.*
