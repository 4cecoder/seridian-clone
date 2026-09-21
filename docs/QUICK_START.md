# Seridian SWE Gauntlet — Quick Start

> **Ready to deploy?** Follow these steps. Should take ~30 minutes.

## 1. Prerequisites

```bash
# Make sure you're in the right directory
cd /Users/fource/bytecats/adventurers/seridian-systems/seridian

# Check Node/Bun versions
bun --version  # Should be 1.4.0
node --version # Should be v22

# Convex CLI ready?
which bunx
```

---

## 2. Authenticate with Convex (first time only)

```bash
# 1. Open dashboard login
bunx convex auth

# This opens browser → sign in with GitHub
# Approval required for Byte Cats account

# 2. Verify authentication
bunx convex list --project seridian

# Should show existing deployments (dev, staging, prod)
# If you see "Error: not authenticated", re-run `convex auth`
```

---

## 3. Set up environment files

```bash
# 3a. Copy example env
cp .env.example .env.local

# 3b. Fill in required vars for LOCAL development
# .env.local should look like:
CONVEX_URL=http://localhost:8200  # Local Convex dev server
CONVEX_DEPLOYMENT=local            # Mark as local (tests will verify this)
RESEND_TEST_API_KEY=               # Leave empty; tests will mock
STRIPE_TEST_KEY=                   # Leave empty; tests will mock

# 3c. DO NOT add production keys here
# If you see re_live_ or sk_live_, DELETE IT IMMEDIATELY

# Verify no production keys
grep -E "re_live|sk_live" .env.local || echo "✓ No production keys detected"
```

---

## 4. Install dependencies

```bash
bun install --frozen-lockfile

# Verify installations
bun --version
bunx tsc --version
bunx vite --version
```

---

## 5. Deploy Convex schema & agent system

```bash
# 5a. Start local Convex dev server (background)
bunx convex dev &

# 5b. Wait 5s for server to boot
sleep 5

# 5c. Push schema + agent functions to local Convex
bunx convex deploy --local

# Expected output:
# ✔ Deployed 5 modules
# ✔ Schema updated: agentWorkItems, agentCheckpoints, laneMetrics, agentConfig
# ✔ Agent functions ready

# 5d. Verify schema was deployed
bunx convex list tables --local

# Should show:
# - agentWorkItems
# - agentCheckpoints
# - laneMetrics
# - agentConfig
# + all existing tables (clients, contracts, issues, etc.)
```

---

## 6. Bootstrap the agent system

```bash
# 6a. Initialize agents + seed work items
bunx convex run --local agent_bootstrap:bootstrapSystem '{
  "includeTestItem": true
}'

# Expected output:
# ✔ Bootstrapped 10 agents
# ✔ Created 19 work items (15 lanes + 3 folds + 1 test)
# ✔ Agent registry ready

# 6b. Verify in Convex dev dashboard
# Open http://localhost:8200 in browser
# Check:
# - agentConfig: 10 rows (orchestrator, planner, engineer×6, reviewer, integrator, analyst)
# - agentWorkItems: 19 rows (pending status)
```

---

## 7. Run unit tests (mocked, local)

```bash
# 7a. Copy vitest config
cp vitest.config.example.ts vitest.config.ts

# 7b. Run example Auth unit tests (100% mocked)
bun run test tests/examples/auth.unit.example.ts

# Expected: All tests pass
# Duration: ~1-2 seconds
# No production services called

# 7c. Check coverage (should be high)
bun run test:coverage tests/examples/auth.unit.example.ts
```

---

## 8. Run the app locally (dev server)

```bash
# 8a. Start Next.js dev server
bun run dev

# Expected output:
#   ▲ Next.js 16.0.0
#   - Local:   http://localhost:3000
#   - Ready in 2.8s

# 8b. Visit http://localhost:3000
# Should see the landing page

# Keep this running in background; you'll need it for E2E tests
```

---

## 9. Deploy to staging (real environment)

```bash
# 9a. Set staging environment
export CONVEX_DEPLOYMENT="staging.seridian.dev"

# 9b. Authenticate with staging (if different account)
bunx convex auth  # May not be needed; depends on permissions

# 9c. Deploy schema to staging
bunx convex deploy

# Expected:
# ✔ Deployed to staging.seridian.dev
# ✔ Schema updated in production Convex deployment

# 9d. Bootstrap staging
bunx convex run agent_bootstrap:bootstrapSystem '{
  "includeTestItem": true
}'

# 9e. Verify staging deployment
# Check convex.cloud dashboard → staging deployment
```

---

## 10. Run E2E tests in staging

```bash
# 10a. Install Playwright (first time)
bunx playwright install

# 10b. Set staging environment
export STAGING_URL=https://staging.seridian.dev

# 10c. Run E2E tests
STAGING_URL=https://staging.seridian.dev \
CONVEX_DEPLOYMENT=staging.seridian.dev \
bunx playwright test tests/examples/auth.e2e.example.ts

# Expected:
# ✓ Signup flow (email verification)
# ✓ Login flow (MFA enabled)
# ✓ Cross-lane integration: Auth → Forms paywall
# ✓ RBAC: Organization members and roles
# Duration: ~5-10 minutes (real browser, real DB)

# 10d. View results
# Check test-results/ directory for videos/screenshots
bunx playwright show-report test-results/
```

---

## 11. Launch the agent fleet

```bash
# 11a. Launch Orchestrator (runs every 60s)
bunx convex run agent_launcher:launchOrchestrator '{}'

# 11b. Launch Planner (quarterly planning)
bunx convex run agent_launcher:launchPlanner '{"context": "quarterly"}'

# 11c. Check agents are running
bunx convex run agent_monitoring:getAgentHeartbeats '{}' | head -20

# Expected: Recent timestamps for all agents

# 11d. View work queue
bunx convex run agent_monitoring:getWorkStatus '{}'

# Should show:
# {
#   "total": 19,
#   "byStatus": {
#     "pending": 15,     // Waiting for engineers
#     "claimed": 0,
#     "in_progress": 0,
#     "completed": 0,
#     "failed": 0
#   }
# }
```

---

## 12. Test the full workflow

```bash
# 12a. Create a test work item
bunx convex run agent_coordination:createWorkItem '{
  "workType": "implementation",
  "lane": "auth",
  "title": "Test: Feature validation",
  "priority": "medium",
  "dependencies": []
}'

# Returns: { "itemId": "..." }

# 12b. Wait for Orchestrator to assign it (60s heartbeat)
sleep 65

# 12c. Check if assigned to engineer
bunx convex run agent_monitoring:getWorkStatus '{"lane": "auth"}'

# Should show:
# "claimed": 1  ← Orchestrator assigned it

# 12d. Simulate engineer completing work
# (Get itemId from step 12a, then:)
bunx convex run agent_coordination:updateWorkItemProgress '{
  "workItemId": "<paste-item-id>",
  "status": "completed",
  "result": {
    "summary": "Feature implemented, 10 tests passing",
    "output": "GitHub PR #42",
    "metrics": {"coverage": "95%"}
  }
}'

# 12e. Verify quality gates
bunx convex run agent_testing:checkQualityGates '{"lane": "Auth"}'

# Should output:
# {
#   "blockDeployment": false,
#   "summary": "✓ All quality gates pass. Ready for deployment."
# }
```

---

## 13. Deploy to production

```bash
# 13a. Verify all tests pass locally and in staging
bun run test:coverage     # Unit tests green
bun run build              # Build succeeds
bunx tsc --noEmit          # No TypeScript errors

# 13b. Merge to main
git add -A
git commit -m "feat: Deploy SWE gauntlet + agent system"
git push origin main

# 13c. Deploy to production Convex
export CONVEX_DEPLOYMENT="prod.seridian.dev"
bunx convex auth
bunx convex deploy

# 13d. Production is now live
# - Agents start heartbeating
# - Work items flow through pipeline
# - Quality gates enforce standards
```

---

## Monitoring after deployment

```bash
# Daily: Check fleet health
bunx convex run agent_monitoring:getFleetStatus '{}'

# Weekly: Ingest scorecard metrics
bunx convex run agent_testing:recordTestCoverage '{
  "lane": "Auth",
  "coverage": 95,
  "uncoveredLines": 23
}'

# Monthly: Review error logs
bunx convex run agent_monitoring:getAgentHeartbeats '{"limit": 100}'

# Quarterly: Planner re-scores gates
bunx convex run agent_launcher:launchPlanner '{"context": "quarterly"}'
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `Error: not authenticated` | Run `bunx convex auth` |
| `Production key detected` | Delete from `.env.local`, use `.env.example` |
| `Tests fail with "network error"` | Ensure `bunx convex dev` is running (port 8200) |
| `E2E tests won't run` | Set `STAGING_URL` env var, don't run locally |
| `Playwright timeout` | Increase timeout in playwright.config.ts |
| `Agent not claiming work` | Check Orchestrator heartbeat (`agent_monitoring:getAgentHeartbeats`) |

---

## Next steps

**Now that the system is live:**

1. **Create real work:** Planner generates planning tasks for all 15 lanes
2. **Spawn engineers:** Each claims work, implements features
3. **Code reviews:** Reviewer validates output
4. **Integration:** Integrator wires lanes together
5. **Measurement:** Analyst tracks activation metrics

**Read:** Full documentation in `/docs/`:
- `AGENT_SYSTEM.md` — Architecture overview
- `TEST_STRATEGY.md` — Testing framework
- `SWE_GAUNTLET_DEPLOYMENT.md` — Detailed deployment
- `AGENT_TOKEN_OPTIMIZATION.md` — Cost optimization
- `AGENT_OPERATIONS.md` — Day-to-day operations

---

**System is ready. Start building.** 🚀

```
     ╔═══════════════════════════════════════════╗
     ║   SERIDIAN 15-LANE PRODUCT PLATFORM      ║
     ║                                           ║
     ║   10 Haiku agents + comprehensive testing║
     ║   Zero production asset usage in tests    ║
     ║   ~$1.70/week, 55% more with optimization║
     ║                                           ║
     ║   Ready to ship the umbrella.             ║
     ╚═══════════════════════════════════════════╝
```
