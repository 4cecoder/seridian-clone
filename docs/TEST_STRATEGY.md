# Seridian Test Strategy — Software Engineering Gauntlet

> **Purpose:** Comprehensive testing, QA, and validation framework across all 15 lanes using coordinated Haiku agents.
>
> **Scope:** Unit tests, integration tests, E2E flows, performance baselines, security validation, and continuous quality gates.

## Testing pyramid per lane

```
                    ▲
                   ╱ ╲
                  ╱   ╲         E2E Tests (10%)
                 ╱     ╲        - Customer workflows
                ╱───────╲       - Cross-lane integrations
               ╱         ╲      - Real databases
              ╱───────────╲
             ╱             ╲    Integration Tests (30%)
            ╱               ╲   - Lane-to-lane APIs
           ╱─────────────────╲  - Convex schema contracts
          ╱                   ╲ - Event bus wiring
         ╱─────────────────────╲
        ╱                       ╲ Unit Tests (60%)
       ╱                         ╱ - Functions, utilities
      ╱                         ╱  - Query/mutation logic
     ╱___________________________╱  - Validators
    ╱_____________________________╱
```

### Per-lane test targets

| Lane | Unit | Integration | E2E | Coverage | Perf Baseline |
|---|---|---|---|---|---|
| **Auth** | 95% | 100% (entitlements, RBAC) | Auth flow | 95% | <100ms user lookup |
| **Mail** | 90% | 95% (templates, delivery) | Send→inbox | 90% | <5s batch send |
| **Forms** | 85% | 95% (embed, submission) | Form→data | 85% | <2s form render |
| **Status** | 85% | 95% (monitors, webhooks) | Page load | 85% | <500ms page load |
| **API** | 90% | 100% (gateway, metering) | Rate limit | 90% | <50ms gateway |
| **Automations** | 80% | 100% (event triggers) | Workflow | 80% | <500ms trigger |
| **Sign** | 85% | 90% (envelope flows) | Sign+capture | 85% | <3s envelope create |
| **Docs** | 80% | 90% (sharing, collab) | Edit+publish | 80% | <1s doc load |
| **CRM** | 85% | 95% (contacts, deals) | CRUD flow | 85% | <2s contact list |
| **Sched** | 80% | 90% (bookings, widgets) | Book meeting | 80% | <2s availability |
| **Designs** | 75% | 85% (canvas, export) | Design+export | 75% | <1s canvas init |
| **Sites** | 80% | 95% (composition, rendering) | Publish site | 80% | <500ms render |
| **Blog** | 75% | 85% (publishing, SEO) | Write+publish | 75% | <1s post load |
| **Help** | 75% | 90% (inbox, routing) | Send+resolve | 75% | <500ms inbox |
| **Vault** | 90% | 100% (E2E crypto) | Encrypt+share | 90% | <200ms decrypt |

---

## Test suite structure (per lane)

```
src/
├── convex/                    # Convex functions
│   ├── <lane>.ts             # Implementation
│   ├── <lane>.test.ts        # Unit tests (convex-test + vitest)
│   └── schema.ts
├── <lane>/                   # Lane code
│   ├── components/           # React components
│   │   └── __tests__/        # Component unit tests (vitest)
│   ├── lib/                  # Utilities
│   │   └── __tests__/        # Utility tests
│   └── __e2e__/              # E2E tests (Playwright)
│       └── <lane>.spec.ts
└── tests/                    # Integration tests (cross-lane)
    ├── auth-forms-flow.spec.ts    # Auth → Forms paywall
    ├── crm-automations-flow.spec.ts  # CRM event → Automation
    └── sites-composition.spec.ts   # Sites consuming widgets
```

---

## Testing agents (additions to fleet)

Beyond Orchestrator, Planner, Engineers, Reviewer, Integrator, Analyst—add:

### 7. **QA Agent** (1 instance, continuous)

**Role:** Unit + integration test generation, test coverage validation, flaky test detection.

**Responsibilities:**
- Generate missing unit tests via code analysis
- Validate integration tests cover all lane APIs
- Track coverage per lane vs. targets above
- Detect flaky tests (same test fails 2+ times in 10 runs)
- Alert when coverage drops below target

**API calls:**
- `recordLaneMetric(lane, "test_coverage", value)` — track % coverage
- `recordLaneMetric(lane, "flaky_tests", count)` — alert on flakiness
- `createWorkItem(workType="testing", title="Generate unit tests for Forms validator")` — queue test work
- `logCheckpoint(agent="qa", message="Auth coverage 95% ✓, Mail coverage 85% (target 90%) ⚠")` — report status

**Implementation style:**
- Runs after each merge to main
- Analyzes code coverage reports
- Generates test stubs for untested functions
- Runs full test suite twice; flags flaky tests

---

### 8. **E2E Agent** (1 instance, per lane)

**Role:** End-to-end test execution, customer journey validation, cross-lane integration testing.

**Responsibilities:**
- Run Playwright E2E tests for each lane's critical path
- Validate form→CRM submission flow
- Test Sites publishing with embedded forms/designs
- Verify Automations triggers fire on lane events
- Run on staging after every feature merge

**Test flows per lane:**
- **Auth:** Signup → email verification → login → enable MFA → logout
- **Mail:** Send API call → template render → DKIM/SPF pass → inbox delivery
- **Forms:** Create form → publish → embed → submit → check submission
- **Status:** Create page → add monitors → incident trigger → status page updates
- **API:** Generate key → make request → check metering → rate limit → error handling
- **Automations:** Trigger event → automation fires → logs captured
- **Sign:** Create envelope → send → sign → audit trail populated
- **Docs:** Create doc → invite collaborator → edit → publish → public read
- **CRM:** Create contact → add deal → update stage → trigger automation
- **Sched:** Create calendar → add availability → book meeting → confirmation sent
- **Designs:** Open editor → create shape → export → verify asset
- **Sites:** Add form widget → add blog widget → publish → visit site → submit form
- **Blog:** Write post → publish → check SEO tags → RSS feed → public visibility
- **Help:** Receive message → route to agent → resolve → customer notified
- **Vault:** Create secret → share with team → member decrypts → audit log

**API calls:**
- `createWorkItem(workType="testing", lane="forms", title="E2E: form submission flow")` — queue tests
- `recordLaneMetric(lane="forms", "e2e_pass_rate", 100)` — track pass rate
- `logCheckpoint(agent="e2e-forms", message="Forms E2E: 8/8 flows passing")` — report status

---

### 9. **Perf Agent** (1 instance, triggered on release)

**Role:** Performance baseline testing, regression detection, load testing.

**Responsibilities:**
- Measure response times for critical paths
- Compare vs. baseline (table above)
- Alert on regressions >10% slower
- Run load tests on API, Mail, Automations
- Generate perf report per lane

**Metrics tracked:**
- **Auth:** User lookup <100ms, login <500ms, token validation <50ms
- **Mail:** Batch send <5s/1000 emails, template render <100ms
- **Forms:** Form render <2s, submission <1s, validation <100ms
- **API:** Gateway latency <50ms, rate limit check <10ms
- **Automations:** Trigger detection <500ms, action execution <1s
- **Sites:** Page load <500ms, composition <1s
- **CRM:** Contact list <2s, deal update <500ms

---

### 10. **Security Agent** (1 instance, per release)

**Role:** Security validation, OWASP checking, schema validation, secrets scanning.

**Responsibilities:**
- Check for SQL injection vectors (Convex queries)
- Validate XSS prevention (output encoding)
- Check secrets not committed (grep .env patterns)
- Verify RBAC enforcement (auth context checks)
- Validate Convex validators on all functions
- Check PII handling per COMPLIANCE.md

**Checks:**
- ✓ All query args validated with `v.*` validators
- ✓ All user input escaped/sanitized
- ✓ Auth context checked before sensitive operations
- ✓ No `.env` patterns in code
- ✓ Convex guidelines compliance (per `convex/_generated/ai/guidelines.md`)
- ✓ PII logged only with consent (COMPLIANCE.md)

---

## Testing orchestration (Haiku agents)

### QA Agent loop (after every merge)

```
1. Pull latest code from main
2. Run: bun run lint && bunx tsc --noEmit && bun run build
3. Run: bunx vitest run --coverage
4. Parse coverage report:
   - Per-lane coverage %
   - Uncovered lines
5. Compare vs. targets (table above)
6. If coverage drops: create work item for QA team
7. If 10+ uncovered lines in critical path: createWorkItem("Add unit tests for X")
8. Log checkpoint with coverage summary
9. Detect flaky tests: run same test 10x, if fails >2x → flag as flaky
10. Log all findings
```

**Example checkpoint:**
```
"QA Report: Auth 95% ✓, Mail 88% ⚠ (target 90%), Forms 85% ⚠ (target 85%, at limit).
Flaky: 1 test (Forms validator edge case). New work: Forms unit tests (15 uncovered lines)."
```

### E2E Agent loop (per lane, after feature merge)

```
1. Start Playwright browser
2. Point to staging environment
3. Run lane's E2E test suite (convex-test + Playwright)
4. For each flow:
   - Execute steps (create account, submit form, etc.)
   - Verify expected state (DB, UI, side effects)
   - Log each step + result
5. Compare against baseline (previous run)
6. If any test fails: screenshot + error log → create issue
7. Log checkpoint with pass/fail per flow
8. Upload test artifacts (videos, screenshots) to storage
```

**Example checkpoint:**
```
"Forms E2E: create (✓), embed (✓), submit (✓), validation (✓), CSV export (✓). 5/5 flows passing.
Load: submit <800ms (baseline 1000ms). ✓ regression-free."
```

### Perf Agent (on release, triggered)

```
1. Start clean staging DB
2. For each lane's critical path:
   - Run operation 100× (or N requests in 1min)
   - Measure: min/max/p50/p95/p99 latencies
   - Compare vs. baseline
3. Alert if any metric >10% slower
4. Run load test: ramp up to 1000 concurrent requests
   - Stop on error rate >1% or timeout
   - Measure: throughput (req/s), latency under load
5. Generate report: before/after graphs
6. Log checkpoint with key metrics + regressions
```

**Example checkpoint:**
```
"Perf baseline: Auth lookup p99 95ms (baseline 100ms) ✓.
Mail batch p95 4.8s (baseline 5s) ✓. Load test: 800 req/s sustained, <1% error. All green."
```

---

## Test execution pipeline

```
Code merged to main
        ↓
   [Lint + Build] (GitHub Actions)
        ↓
   [Unit Tests] (vitest, 100 coverage checks)
        ↓
   [Integration Tests] (Convex functions + cross-lane)
        ↓
   [QA Agent] (coverage analysis, flaky detection)
        ↓
   [E2E Agent] (Playwright, all lanes)
        ↓
   [Perf Agent] (baseline + regressions)
        ↓
   [Security Agent] (OWASP, secrets, validators)
        ↓
Deploy to staging (green gate)
        ↓
[Monitor in staging 24h]
        ↓
Deploy to production (if no incidents)
```

---

## Quality gates (blocking deployment)

| Gate | Metric | Threshold | Owner |
|---|---|---|---|
| **Build** | TypeScript + ESLint | Must pass | CI |
| **Unit tests** | Coverage per lane | ≥ target % (table above) | QA Agent |
| **Integration tests** | Cross-lane flows | 100% pass | QA Agent |
| **E2E tests** | Critical paths | 100% pass | E2E Agent |
| **Flaky tests** | False failures | 0 flaky in blocking tests | QA Agent |
| **Perf** | Latency regression | <10% slower vs. baseline | Perf Agent |
| **Security** | OWASP + PII | All checks pass | Security Agent |
| **Code review** | Convex patterns | Per guidelines | Reviewer Agent |

**Blocker rule:** Any gate fails → work item created, deployment blocked until fixed.

---

## Example: Auth lane shipping (Wave 1)

### Engineer builds MFA feature
```
1. Write code: TOTP + backup codes
2. Commit: "feat: Auth TOTP MFA"
3. Push to PR
```

### QA Agent validates
```
1. Run vitest on convex/auth.test.ts → 95% coverage ✓
2. Run integration test: Auth entitlements read by Forms ✓
3. Check for flaky tests: none ✓
4. Checkpoint: "Auth unit tests 95% ✓, integration ✓"
```

### E2E Agent validates
```
1. Start Playwright
2. Run Auth E2E flows:
   - Signup → ✓
   - Email verify → ✓
   - TOTP enable → ✓
   - TOTP login → ✓
   - Recovery codes → ✓
3. Cross-lane: Auth → Forms paywall → ✓
4. Checkpoint: "Auth E2E all flows ✓"
```

### Perf Agent validates
```
1. Load test: token validation <50ms p99 ✓
2. User lookup <100ms p99 ✓
3. Login flow <500ms p99 ✓
4. Checkpoint: "Auth perf baseline ✓"
```

### Security Agent validates
```
1. Check validators on all Auth queries ✓
2. Check RBAC enforced ✓
3. No secrets in code ✓
4. No XSS vectors ✓
5. Checkpoint: "Auth security ✓"
```

### Reviewer approves
```
1. Code review passes: patterns, naming, tests ✓
2. All quality gates green ✓
3. Mark work item completed
4. Unblock deployment
```

### Deployment
```
Deploy to staging (24h monitoring)
→ No incidents → Deploy to production
```

---

## Test environments & mocking

### Environment tiers (NEVER cross streams)

```
┌──────────────────────────────────────────────────────────────────┐
│                       PRODUCTION                                  │
│  Real databases, real customers, real Resend/Stripe/external svc │
│  ⚠️  NEVER run tests here. NEVER mock here.                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      STAGING (real deps)                          │
│  Real Convex DB (separate), real Resend sandbox, real test keys  │
│  ✓ E2E tests only. ✓ Can hit real external services (sandboxes). │
│  ✓ Long-lived test data (users, orgs persist).                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    LOCAL/CI (all mocked)                          │
│  In-memory Convex (convex-test), mocked Resend, mocked Stripe    │
│  ✓ Unit tests. ✓ Integration tests. ✗ NO external APIs.          │
│  ✓ Ephemeral: every test run = fresh state.                      │
└──────────────────────────────────────────────────────────────────┘
```

### Test matrix

| Test Type | Environment | Mocking | Data | Duration | Owner |
|---|---|---|---|---|---|
| **Unit** | Local/CI | 100% mocked (Resend, Stripe, S3) | Ephemeral | <1s each | QA Agent |
| **Integration** | Local/CI | 100% mocked external | Ephemeral | <5s each | QA Agent |
| **E2E (pre-staging)** | Local/CI | Mocked (can't test real integrations) | Ephemeral | <30s each | Developer |
| **E2E (real)** | Staging | Real Resend sandbox, Stripe test keys | Long-lived | <10s each | E2E Agent |
| **Load** | Staging | Real Resend sandbox (limited rate) | Ephemeral | <5min | Perf Agent |
| **Security** | Staging | All checks | Ephemeral | <5min | Security Agent |

### Mocking strategy (LOCAL/CI only)

**Resend (Email):**
```typescript
// Mock in convex/mail.test.ts
import { mockResend } from "@convex-dev/mail-testing";
const sendEmail = async (to: string, template: string) => {
  const mock = mockResend();
  // Captured in mock.sentEmails array, never touches real service
  await mock.send({ to, template });
  expect(mock.sentEmails[0].to).toBe(to);
};
```

**Stripe (Billing):**
```typescript
// Mock in tests/billing.spec.ts
const stripe = new Stripe(process.env.STRIPE_TEST_KEY, {
  apiVersion: "2024-01-01",
});
// Stripe test keys are sandbox-only, safe for unit tests
const charge = await stripe.charges.create({
  amount: 2000,
  currency: "usd",
  source: "tok_mastercard", // Test card, never real
});
```

**S3/Storage:**
```typescript
// Mock in convex/files.test.ts
import { mockS3 } from "@convex-dev/storage-testing";
const storage = mockS3();
await storage.put("file.pdf", buffer);
expect(storage.files.get("file.pdf")).toEqual(buffer);
```

**Convex DB:**
```typescript
// convex-test handles this
import { convexTest } from "convex-test";
const t = convexTest(schema, modules);
// Creates in-memory Convex instance, no real DB touch
const result = await t.mutation(api.auth.signup, { email: "test@ex.com" });
```

### Staging (real sandboxes ONLY)

**Resend:**
```typescript
// E2E tests in tests/e2e/mail.spec.ts
const RESEND_API_KEY = process.env.RESEND_TEST_API_KEY; // Separate from production
const email = await resend.emails.send({
  from: "test@seridian.dev",
  to: "test-inbox@seridian.dev",
  subject: "Test email",
  html: "<p>Hello</p>",
});
// Real email sent to test inbox (under our control)
// ✓ Safe to run in staging
```

**Stripe:**
```typescript
// E2E billing tests
const STRIPE_TEST_KEY = process.env.STRIPE_TEST_KEY; // Never production
const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  line_items: [{ price: "price_test_xyz", quantity: 1 }],
  success_url: "https://staging.seridian.dev/success",
});
// ✓ Test cards (tok_mastercard, tok_visa) work in Stripe test mode
// ✓ No real charges, safe billing tests
```

### CRITICAL: Environment detection

```typescript
// convex/middleware.ts or similar
const ENVIRONMENT = process.env.CONVEX_DEPLOYMENT || "local";
const IS_PRODUCTION = ENVIRONMENT === "prod.seridian.dev";
const IS_STAGING = ENVIRONMENT === "staging.seridian.dev";
const IS_LOCAL = ENVIRONMENT === "local";

// For any external API call:
if (IS_PRODUCTION) {
  // Use real Resend, real Stripe, real API keys
  const apiKey = process.env.RESEND_API_KEY; // Production key
  // Require manual approval to even read these
}

if (IS_STAGING) {
  // Use sandbox/test keys
  const apiKey = process.env.RESEND_TEST_API_KEY; // Separate key
  // Can run E2E tests safely
}

if (IS_LOCAL) {
  // Throw error if real API keys detected
  if (process.env.RESEND_API_KEY?.includes("re_live_")) {
    throw new Error("❌ PRODUCTION KEY DETECTED IN LOCAL ENV. Delete .env, use .env.example");
  }
  // Use mocks only
}
```

### Test data seeding (staging only)

For E2E tests in staging, seed databases with:
- 100 test users (auth, prefix "test_user_")
- 10 test organizations (prefix "test_org_")
- 50 test forms (prefix "test_form_")
- 20 test email templates
- 100 test contacts (CRM)
- 5 test automation workflows
- 10 test designs
- 1 test site (composition of all widgets)

**Rules:**
- Test data is cleaned up after 7 days (automated job)
- All test users prefixed with "test_" so never marketed to
- Test submissions never touch real Slack/webhooks (mocked)
- Test events logged separately (staging event stream)

### CI/CD gates (environment safety)

```bash
# .github/workflows/test.yml
env:
  CONVEX_DEPLOYMENT: "local"
  NODE_ENV: "test"
  # ❌ NO production/staging env vars loaded in CI
  # ✓ Only test API keys for Stripe, Resend (if needed)

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Detect production key leakage
        run: |
          if grep -r "re_live_" .env* || grep -r "sk_live_" .env*; then
            echo "❌ PRODUCTION KEY DETECTED"
            exit 1
          fi
      
      - name: Unit tests (all mocked)
        run: bunx vitest run --environment=edge-runtime
      
      - name: Integration tests (mocked Convex)
        run: bunx vitest run convex/**/*.test.ts
      
      # ✗ NO E2E tests in CI (they require staging environment)
      # E2E tests run separately on staging merge only
```

### E2E test trigger (staging only)

```
Merge to main
  → CI runs (unit + integration, mocked)
  → Build passes → Auto-merge to staging branch
  → E2E Agent triggers (Playwright against real staging DB)
  → Perf Agent runs (load tests with real sandboxes)
  → If all pass → Deploy to production
```

---

## NEVER do this

❌ Run E2E tests against production (would test real customers)
❌ Use production API keys in .env.example
❌ Mock Convex DB in E2E tests (defeats integration testing)
❌ Send real emails during unit tests
❌ Charge real credit cards during billing tests
❌ Check in .env with real keys (git hooks should block this)

---

## DO this instead

✓ Unit tests: 100% mocked (Resend, Stripe, S3, Convex)
✓ Integration tests: Real Convex (in-memory), real schema validation, mocked external
✓ E2E tests: Real Convex (staging), real Resend sandbox, real Stripe test keys
✓ .env.example: Shows structure, uses fake test keys or comments "leave blank for mocking"
✓ CI: Detects production keys, fails if found
✓ Environment detection: Code checks $CONVEX_DEPLOYMENT, uses right keys per tier

---

## Continuous monitoring (production)

### Error rate alert
- Any lane error rate >1% in 5-minute window → page on-call

### Performance alert  
- Any critical path >150% baseline latency → page on-call

### Test coverage regression
- Coverage drops >2% month-over-month → create investigation work item

### Flaky test alert
- Same test fails 2+ times in production → page on-call + block further merges

---

## Next steps

1. **Setup**: Create vitest config, Playwright config, test fixtures
2. **QA Agent**: Implement coverage tracking, flaky detection
3. **E2E Agent**: Implement Playwright runners per lane
4. **Perf Agent**: Implement load testing via k6 or Artillery
5. **Security Agent**: Implement OWASP checks + secrets scanning
6. **Gate enforcement**: Block deployment on gate failures
7. **Monitoring**: Dashboard showing test results + trends per lane

---

*Test Strategy — Every lane ships with 80%+ coverage, E2E validation, and performance baselines. Quality is not optional.*
