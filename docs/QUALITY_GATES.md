# Seridian Quality Gates — Deterministic Certification

> **Philosophy:** The model proposes. The gates certify. No work ships until all deterministic gates pass.
>
> All gates run without LLM calls, producing cryptographic or programmatic proof of correctness.

---

## 6-Gate Certification Pipeline

```
┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│  SyntaxGate  │──►│ RepeatGate   │──►│ DiffGate (Safe) │──►│  CompileGate │──►│ CoverageGate │──►│ ObjectiveGate │
└──────────────┘   └──────────────┘   └─────────────────┘   └──────────────┘   └──────────────┘   └───────────────┘
```

Every work item specifies required gates in its `WorkItemContract`. When all gates pass, the work is certified and unblocks deployment.

---

## Gate Definitions

### 1. SyntaxGate (Required)
**Validates code structural integrity.**

- **Balanced Braces & Parentheses**: Scans `{}` and `()` balance across all code blocks.
- **Non-Empty Code**: Rejects whitespace-only or truncated completions.
- **Valid TypeScript**: Parses code for basic lexical structure (no parse errors before compilation).

**Rejection Example:**
```
SyntaxGate FAILED: Unbalanced braces in src/components/Header.tsx
- Line 42: 3 open, 2 close. Missing closing brace before EOF.
- Action: Engineer must fix brace balance.
```

---

### 2. RepeatGate (Required)
**Prevents hallucination loops and cycling.**

- **SHA-256 Content Fingerprinting**: Computes cryptographic hash of every code submission.
- **Cycle Detection**: Detects if agent is cycling between identical failed attempts.
- **Diagnostic**: Returns hash mismatch advice.

**Rejection Example:**
```
RepeatGate FAILED: Identical submission detected
- Hash: a3f8d2c9... (seen in turn 3 and turn 5)
- Action: Engineer must modify implementation strategy, not retry same code.
```

**FailChain Escalation:**
- **Turn 1:** Gentle hint with hash and line number
- **Turn 2:** Stern directive ("Don't repeat this pattern; try a different approach")
- **Turn 3+:** Critical intervention (Orchestrator reassigns work, marks blocked)

---

### 3. DiffGate (Required — Security & Policy)
**Inspects file modifications before application.**

- **Workspace Boundary Enforcement**: Prevents directory traversal (`../../etc/passwd`).
- **Sensitive Path Guard**: Blocks reads/writes to:
  - `~/.ssh`, `~/.aws`, `~/.gnupg`
  - `id_rsa`, `.env.production`, `.env.local` (if contains keys)
  - Any path outside project root
- **Destructive Command Guard**: Catches unsafe primitives:
  - `rm -rf /`, `mkfs`, `sudo`, `dd if=/dev/zero`
  - Non-interactive destructive operations
- **Production Key Detection**: Scans for:
  - `re_live_` (Resend production keys)
  - `sk_live_` (Stripe production keys)
  - `OPENAI_API_KEY` (if value starts with `sk-` without `test`)
  - Any `.env` line with production markers

**Rejection Example:**
```
DiffGate FAILED: Production key detected
- File: .env.local
- Line 3: RESEND_API_KEY=re_live_abc123...
- Action: Delete production keys immediately. Use test keys only in local/staging.
```

---

### 4. CompilationGate (Required)
**Runs language toolchain diagnostics.**

- **TypeScript**: Invokes `tsc --noEmit`
- **Build**: Invokes `bun run build`
- **Linting**: Invokes `bun run lint`
- **Surfaces Exact Errors**: Returns compiler error line, column, and message.

**Rejection Example:**
```
CompilationGate FAILED: TypeScript compilation error
- File: src/components/Badge.tsx:24
- Error: Type 'string | undefined' is not assignable to type 'string'.
- Action: Add null check or type guard before using value.
```

---

### 5. CoverageGate (Required)
**Validates test coverage thresholds per lane.**

- **Per-Lane Threshold Enforcement**: 
  - Auth: ≥95%
  - Mail: ≥90%
  - Forms: ≥85%
  - (See TEST_STRATEGY.md for full table)
- **Missing Tests Detection**: Flags untested functions/branches.
- **Metric Tracking**: Stores coverage trend over time.

**Rejection Example:**
```
CoverageGate FAILED: Auth lane below coverage threshold
- Target: 95%
- Actual: 92%
- Uncovered Lines: 8 (mostly error paths in validateToken)
- Action: Engineer must add 3 more unit tests for edge cases.
```

---

### 6. ObjectiveGate (Required)
**Asserts work item completion without secondary LLM calls.**

Declarative checks on the `WorkItemObjectives`:

- **Exported API**: Validates required symbols are publicly exported.
  - Example: `export function sendEmail(...)` must exist
- **Test Count**: Asserts minimum test count (e.g., "at least 6 unit tests for Auth badge").
- **E2E Pass Rate**: Verifies E2E tests 100% pass (if in scope).
- **Database Schema**: Validates new schema matches contract (if DB changes).

**Rejection Example:**
```
ObjectiveGate FAILED: Missing required exports
- Work Item: "Auth email verification badge"
- Required: export EmailVerificationBadge component
- Found: Component exists but not exported
- Action: Add `export` keyword to component declaration.
```

---

## Quality Gate Contract

Every work item declares required gates in `WorkItemContract`:

```typescript
interface WorkItemContract {
  workItemId: string;
  title: string;
  lane: string;
  requiredGates: ["syntax", "repeat", "diff", "compile", "coverage", "objective"];
  coverageTarget: number; // e.g., 95 for Auth
  e2eRequired: boolean;
  objectives: string[]; // e.g., ["export EmailVerificationBadge", "6+ tests"]
  maxRounds: number; // e.g., 6 attempts before giving up
}
```

---

## Escalating Feedback (FailChain)

When an agent fails a gate repeatedly:

| Consecutive Failures | Escalation | Feedback |
|---|---|---|
| **1 Failure** | Gentle | Diagnostic hint with exact error line + context |
| **2 Failures** | Stern | "Don't repeat pattern X; try approach Y instead" |
| **3+ Failures** | Critical | Orchestrator reassigns work, marks `blocked`, creates escalation ticket |

**Example Escalation:**
```
Turn 1 (Gentle):
  DiffGate FAILED: re_live_ key in .env
  Line 5: RESEND_API_KEY=re_live_...
  → Delete the line, use test key instead.

Turn 2 (Still has key):
  DiffGate FAILED: SAME ERROR
  → This is not just an oversight. You must:
     1. Delete .env entirely
     2. Copy .env.example
     3. Never commit .env to git
  
Turn 3+ (Still failing):
  CRITICAL: Work item blocked. Gate failures exceed threshold.
  Escalation: Orchestrator → reassign to different engineer
  Ticket created: "Auth badge: production key leakage (3 failures)"
```

---

## Gate Results & Convex Storage

After each gate check, record in `laneMetrics` table:

```typescript
{
  lane: "auth",
  workItemId: "k8x2j9p3m1",
  timestamp: 1726791360000,
  gateResults: {
    syntax: { passed: true },
    repeat: { passed: true },
    diff: { passed: false, reason: "Production key re_live_ detected" },
    compile: { passed: false, reason: "TypeScript error line 24" },
    coverage: { passed: false, target: 95, actual: 92 },
    objective: { passed: false, missingExports: ["EmailVerificationBadge"] }
  },
  blockDeployment: true
}
```

---

## Deployment Blocker Rules

| Condition | Action |
|---|---|
| Any gate fails | **Deployment blocked.** Create work item to fix. |
| Same gate fails 2× in sequence | **Escalate feedback** (stern warning) |
| Same gate fails 3+ times | **Critical intervention.** Orchestrator reassigns work. |
| DiffGate detects production key | **Immediate block.** No escalation—reject unconditionally. |
| CoverageGate fails by >10% points | **Mandatory:** Engineer adds tests until gate passes. |

---

## Implementation Checklist

- [ ] Convex functions for each gate (syntax, repeat, diff, compile, coverage, objective)
- [ ] SHA-256 fingerprinting for RepeatGate (track all submissions per work item)
- [ ] DiffGate production key detection (grep `re_live_`, `sk_live_`, `sk-` without test)
- [ ] CompilationGate invokes `tsc --noEmit`, `bun run build`, `bun run lint`
- [ ] CoverageGate queries coverage reports from QA agent
- [ ] ObjectiveGate checks exported symbols via AST parser or grep
- [ ] FailChain escalation: track failure count, escalate feedback
- [ ] Store all gate results in `laneMetrics` table
- [ ] Orchestrator blocks deployment if `blockDeployment: true`

---

## Reference

Inspired by [Adventurers Harness Gate Certification System](~/bytecats/adventurers/adventurers-harness/docs/gates.md).

The philosophy: **The model proposes. The gates certify. Completion requires hard proof.**
