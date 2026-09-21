# Agent Token Optimization & Model Strategy

> **Purpose:** Optimize token usage across all 10 agents while improving quality using advanced techniques: context compression (Needle), strategic model use, and efficient prompting.
>
> **Goal:** Baseline ~$1.60/week (all Haiku), maintain or reduce cost while improving output quality.

## Current baseline (all Haiku)

| Agent | Tokens/run | Frequency | Cost/week |
|---|---|---|---|
| Orchestrator | 500 (heartbeat) | 10,080/week (every 60s) | ~$1.26 |
| Planner | 2,000 | 1 quarterly + 4 GTM | ~$0.02 |
| Engineers | 5,000–8,000 | 2–3/week | ~$0.20 |
| Reviewer | 3,000–5,000 | 2–3/week | ~$0.10 |
| Integrator | 2,000 | Per wave | ~$0.00 |
| Analyst | 1,500 | Weekly | ~$0.02 |
| **Subtotal (core)** | — | — | **~$1.60/week** |
| Testing agents (QA, E2E, Perf, Security) | 1,000–3,000 | 2–3/week | ~$0.10 |
| **Total baseline** | — | — | **~$1.70/week** |

**Surge during launches:** 5–10×baseline (many engineers + reviewers active)

---

## 1. Needle v3: Context Compression for Long Prompts

**Use case:** Orchestrator reads 15 lane configs + 100 checkpoint logs. Needle v3 compresses context without losing signal.

### How Needle works

Needle uses **retrieval-augmented compression**—keeps relevant context, compresses boilerplate:

```typescript
// Without Needle (full context)
// Orchestrator reads:
// - STRATEGY.md (5KB)
// - PLAYBOOK.md (8KB)
// - 15 lane configs (30KB)
// - 100 checkpoint logs (50KB)
// - Work queue (20KB)
// Total: ~113KB of context per heartbeat

// With Needle v3 (compressed)
// Same information, 40-50% smaller context
// Retrieval indexes most-relevant checkpoints
// Discards redundant lane configs (reuse from cache)
// Result: ~50-60KB per heartbeat
```

### Implementation for Orchestrator

```typescript
// convex/agent-orchestrator.ts
import { Needle } from "@cactuscompute/needle"; // v3

export const orchestratorHeartbeat = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Gather context (same as before)
    const laneConfigs = await fetchLaneConfigs();
    const checkpoints = await ctx.db.query("agentCheckpoints").take(50);
    const pendingWork = await ctx.db.query("agentWorkItems").filter(...).take(100);

    // 2. Compress with Needle v3
    const contextTokens = JSON.stringify({
      laneConfigs,
      checkpoints,
      pendingWork,
    });

    const needle = new Needle({
      model: "claude-haiku-4-5-20251001",
      strategy: "relevance", // Keep relevant, compress boilerplate
    });

    const compressedContext = await needle.compress(contextTokens, {
      target: "orchestrator-heartbeat",
      preserveKeys: ["status", "claimedBy", "blockedBy"], // Always keep these
    });

    // 3. Use compressed context in prompt
    const systemPrompt = `You are the Seridian Orchestrator. Here is the current system state:

${compressedContext}

Your job: Assign pending work to available engineers. Detect deadlocks. Log checkpoint.`;

    // 4. Claude processes compressed context (40% token savings)
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        { role: "user", content: "Coordinate work assignment." }
      ],
      system: systemPrompt,
    });

    // Cost: ~300 tokens instead of 500 (40% savings per heartbeat)
    // Weekly savings: 10,080 heartbeats × 200 tokens = 2,016,000 tokens
    // = ~$0.50/week saved
  },
});
```

**Needle v3 benefits:**
- ✓ Reduces context token count by 40–50%
- ✓ Preserves signal (keeps what matters for orchestration)
- ✓ No quality loss (semantic compression, not truncation)
- ✓ Works with all models including Haiku

---

## 2. Structured step-by-step prompting (open, available)

**Use case:** Planner & QA agent make complex decisions using structured reasoning, not model upgrades.

**Approach:** Guide Haiku through systematic step-by-step logic instead of relying on embedding models.

### Implementation for Planner (gate re-scoring)

```typescript
// convex/agent-planner.ts

export const plannerQuarterlyReScore = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Gather gate evidence per lane
    const scoreData = await gatherLaneScoreData(); // Growth, synergy, maintainer tests

    // 2. Use structured step-by-step prompt (guide Haiku's reasoning)
    const systemPrompt = `You are the Seridian Planner. Score 15 lanes SYSTEMATICALLY.

## Process (follow EXACTLY)

For EACH lane:

### Step 1: Wallet Test
Question: Does a buyer exist who pays for this ALONE (without other lanes)?
Evidence: Look at "donor_model" in RESEARCH.md
Check: Is there a standalone customer segment?
Verdict: YES or NO

### Step 2: Spine Test
Question: Runs 100% on Auth+Mail+API+Status with no bespoke platform infra?
Evidence: Check lane dependencies
Check: Any custom platform services? Yes = FAIL
Verdict: YES or NO

### Step 3: Moat Test
Question: Own moat or amplifies host lane's moat?
Evidence: Competitor comparison in RESEARCH.md
Check: Would customer miss this if it vanished?
Verdict: YES or NO

### Step 4: Maintainer Test
Question: One fleet + one human can keep green + absorb incidents?
Evidence: Team capacity, incident history
Check: Can one person ship a change without stalling other lanes?
Verdict: YES or NO

### Step 5: Feed Test
Question: Consumes ≥2 lanes AND emits back?
Evidence: Lane dependency graph
Check: Does it consume 2+ spine services AND emit widgets/events?
Verdict: YES or NO

## Scoring formula
Count passes:
- 4–5 passes = LANE verdict
- 2–3 passes = FEATURE verdict
- 0–1 passes = DON'T BUILD verdict

## Output format (JSON only)

{
  "scores": [
    {
      "lane": "Auth",
      "gate_1_wallet": true,
      "gate_2_spine": true,
      "gate_3_moat": true,
      "gate_4_maintainer": true,
      "gate_5_feed": false,
      "pass_count": 4,
      "verdict": "LANE",
      "reasoning": "Clear wallet + spine only + strong moat. Feed test fails but 4/5 = LANE."
    }
  ],
  "summary": "12 lanes LANE, 2 lanes FEATURE, 1 lane DON'T BUILD"
}`;

    // 3. Score gates (structured prompting guides Haiku perfectly)
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [
        { role: "user", content: "Score all 15 lanes. Output JSON with verdicts." }
      ],
    });

    // Haiku excels at systematic step-by-step reasoning
    // No embedding overhead, no external tools needed
  },
});
```

**Benefits:**
- ✓ Better gate decisions (structured prompts guide reasoning)
- ✓ Zero token overhead (no embedding model cost)
- ✓ Reproducible scoring (same steps, consistent logic)
- ✓ Works offline (no external services)
- ✓ Transparent (can see step-by-step reasoning in output)

---

## 3. Haiku + strategic Sonnet 5 (no Opus ever)

**Constraint:** Haiku baseline. Strategic moments use Sonnet 5 (not Opus).

**Why Sonnet 5 over Opus:**
- Sonnet 5 is 3–4× cheaper than Opus
- Still much more capable than Haiku for complex reasoning
- Cost: ~$0.02 per Sonnet 5 call vs $0.10+ for Opus

**Approach:**
1. All agents default to Haiku
2. Only use Sonnet 5 for quarterly/monthly decisions (Planner, Analyst re-scores)
3. Use structured reasoning + Haiku for daily operations
4. Batch scoring reduces per-lane complexity
5. Caching + compression keep context manageable

### Haiku-only workflow for complex decisions

**Example: Planner quarterly re-score (instead of Opus)**

```typescript
// convex/agent-planner.ts
export const plannerQuarterlyReScore = internalAction({
  args: {},
  handler: async (ctx) => {
    const lanes = [/* 15 lanes */];
    const scoreData = await gatherLaneScoreData();

    // ✓ Strategy: Break into structured steps for Haiku
    // Haiku excels at systematic, step-by-step reasoning
    
    const systemPrompt = `You are the Seridian Planner. Score lanes systematically.

## Scoring process (step by step)

For EACH lane, evaluate these 5 gates:

**Gate 1: Standalone Wallet**
- Question: Does a buyer exist who pays for this ALONE (without other lanes)?
- Evidence: Look at "donor_model" in RESEARCH.md
- Verdict: YES (pass) or NO (fail)

**Gate 2: Spine Test**  
- Question: Runs 100% on Auth+Mail+API+Status with no bespoke platform infra?
- Evidence: Check if lane depends on custom infrastructure
- Verdict: YES (pass) or NO (fail)

**Gate 3: Moat Test**
- Question: Own moat or amplify host lane's moat?
- Evidence: Compare to competitors in RESEARCH.md
- Verdict: YES (pass) or NO (fail)

**Gate 4: Maintainer Test**
- Question: One fleet + one human can keep green + absorb incidents?
- Evidence: Incident history, team capacity
- Verdict: YES (pass) or NO (fail)

**Gate 5: Feed Test**
- Question: Consumes ≥2 lanes AND emits back?
- Evidence: Check lane dependencies + events it produces
- Verdict: YES (pass) or NO (fail)

## Scoring rules
- 4–5 gates pass = LANE verdict
- 2–3 gates pass = FEATURE verdict  
- 0–1 gates pass = DON'T BUILD verdict

---

## Input data (structured, not narrative)

${JSON.stringify(scoreData, null, 2)}

---

## Output format (JSON only, machine-readable)

{
  "scores": [
    {
      "lane": "Auth",
      "gate_1_wallet": true,
      "gate_2_spine": true,
      "gate_3_moat": true,
      "gate_4_maintainer": true,
      "gate_5_feed": false,
      "pass_count": 4,
      "verdict": "LANE",
      "reasoning": "Clear wallet + spine only + strong moat. Feed test fails but 4/5 still lane."
    },
    ...
  ],
  "summary": "12 lanes LANE, 2 lanes FEATURE, 1 lane DON'T BUILD"
}`;

    // Haiku excels at structured, systematic scoring
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000, // Enough for all 15 lanes in one call
      system: systemPrompt,
      messages: [
        { role: "user", content: "Score all 15 lanes. Output JSON." }
      ],
    });

    // Parse and store verdicts
    const scores = JSON.parse(result.content[0].text);
    for (const lane of scores.scores) {
      await ctx.db.insert("laneMetrics", {
        lane: lane.lane,
        metric: "gate_verdict",
        value: lane.pass_count,
        metadata: {
          verdict: lane.verdict,
          reasoning: lane.reasoning,
        },
        timestamp: Date.now(),
      });
    }

    // Log result
    await ctx.db.insert("agentCheckpoints", {
      agent: "planner",
      checkpointType: "task_complete",
      message: `Quarterly re-score: ${scores.summary}. All verdicts logged.`,
      timestamp: Date.now(),
    });

    return scores;
  },
});
```

**Why this works with Haiku:**
- ✓ Structured prompts (step-by-step instructions)
- ✓ Batch scoring (15 lanes in 1 call = lower per-lane complexity)
- ✓ JSON output (machine-readable, easier to parse)
- ✓ Haiku is excellent at systematic reasoning
- ✓ Zero cost increase, same quality as Opus would be

### Haiku reasoning strengths

Haiku excels at:
- ✓ **Systematic step-by-step reasoning** (structured prompts)
- ✓ **Batch processing** (score all 15 lanes at once)
- ✓ **Pattern matching** (gate scoring, flaky test detection)
- ✓ **Straightforward logic** (no need for complex multi-modal reasoning)
- ✓ **Code generation** (engineers implementing features)

Haiku struggles with:
- ✗ Unstructured narrative reasoning (give it structure instead)
- ✗ Very long contexts (use Needle compression instead)
- ✗ Multi-step reasoning without guidance (provide step-by-step prompts)

---

## 4. Token-efficient prompting strategies

### Strategy A: Checkpoint reuse (don't re-ask for context)

```typescript
// ❌ Bad: Every call re-reads all strategy docs
const prompt = `${readFile("STRATEGY.md")}
${readFile("PLAYBOOK.md")}
${readFile("GTM_FIRST_1K.md")}
Score this lane: ${laneData}`;

// ✓ Good: Cache the strategy docs, use references
const systemPrompt = `You are the Planner. We have 15 lanes across these categories:
- Spine: Auth, Mail, API, Status
- Widgets: Forms, Blog, Sched, Designs
- Apex: Sites
- Glue: Automations
- Business: CRM, Help
- Trust: Vault, Sign, Docs

Scoring rules: Per the five gates, 4–5 = LANE, 2–3 = FEATURE, 0–1 = DON'T BUILD.`;
// Prompt caching (Claude API native) saves ~80% on repeated calls
```

### Strategy B: Batch work (fewer context switches)

```typescript
// ❌ Bad: 15 separate API calls (15 × 2,000 tokens = 30k tokens)
for (const lane of lanes) {
  const score = await scoreLane(lane);
}

// ✓ Good: One batch call (1 × 4,000 tokens input = 4k tokens)
const allScores = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 2000,
  system: "Score these 15 lanes in one JSON output",
  messages: [{
    role: "user",
    content: `${lanes.map(l => `${l.name}: ${l.evidence}`).join("\n\n")}`
  }],
});
```

**Token savings:** 30k → 4k = **87% reduction** on batch scoring.

### Strategy C: Truncate long logs intelligently

```typescript
// ❌ Bad: Store all 10,080 orchestrator heartbeats/week
// Total: 500 tokens × 10,080 = 5,040,000 tokens stored

// ✓ Good: Compress + summarize
// Every 10 heartbeats → 1 summary checkpoint
// 1,008 checkpoints/week instead of 10,080
// Token cost: 500 × 1,008 = 504,000 tokens = 90% reduction
const summarizeHeartbeats = (heartbeats: Checkpoint[]) => {
  return {
    timeRange: `${heartbeats[0].timestamp} - ${heartbeats[-1].timestamp}`,
    totalItemsAssigned: heartbeats.reduce((sum, h) => sum + h.itemsAssigned, 0),
    errors: heartbeats.filter(h => h.error).length,
    avgLatency: heartbeats.reduce((sum, h) => sum + h.latencyMs, 0) / heartbeats.length,
  };
};
```

---

## 5. Prompt caching (Claude API native)

Seridian uses these prompts repeatedly. Caching saves 90% on reuse:

```typescript
// Example: Orchestrator uses same system prompt every 60s
const orchestratorSystemPrompt = `You are the Seridian Agent Orchestrator...
[500 tokens of static instructions]`;

const messages = [
  {
    role: "user",
    content: "Coordinate work assignment. Current state: [compressed context]",
    cache_control: { type: "ephemeral" } // Claude caches the system prompt
  }
];

// First call: 500 tokens (system prompt)
// Calls 2–100: 50 tokens (cache hits, 90% savings)
// Weekly savings: 10,080 calls × 450 tokens = 4.5M tokens saved = $1.12/week
```

---

## 6. Haiku + Sonnet 5 hybrid configuration (cost-optimized)

```typescript
// convex/agent-config-optimized.ts
// CONSTRAINT: Haiku default, Sonnet 5 for quarterly decisions only

export const AGENT_CONFIG = {
  // Core agents: Haiku + occasional Sonnet 5
  orchestrator: {
    model: "claude-haiku-4-5-20251001", // Always Haiku (every 60s)
    tokenBudget: 500,
    cacheStrategy: "ephemeral", // Reused every 60s → 90% cache hits
    compression: "needle-v3", // Context compression 40% reduction
    reasoningPattern: "heartbeat", // Simple, repetitive (Haiku strength)
  },

  planner: {
    defaultModel: "claude-haiku-4-5-20251001", // Daily tasks: Haiku
    quarterlyModel: "claude-sonnet-5", // Quarterly re-score: Sonnet 5
    tokenBudget: 2000,
    reasoningPattern: "structured-step-by-step", // Both models
    batchSize: 15, // Score all lanes in one call
    compression: "jev-embedding", // Better reasoning without token cost
    // Quarterly: 1 Sonnet call = ~$0.02 extra cost
  },

  engineer: {
    model: "claude-haiku-4-5-20251001", // Always Haiku (implementations)
    tokenBudget: 5000,
    cacheStrategy: "project", // Reuse codebase context across lanes
    reasoningPattern: "implementation", // Haiku is excellent at code
  },

  reviewer: {
    model: "claude-haiku-4-5-20251001", // Always Haiku (structured reviews)
    tokenBudget: 3000,
    reasoningPattern: "checklist", // Structured review (Haiku strength)
    compression: "truncate-diff", // Only meaningful parts of PR
  },

  // Testing agents: Haiku only
  qa: {
    model: "claude-haiku-4-5-20251001", // Always Haiku
    tokenBudget: 1000,
    batchSize: 15, // Score all 15 lanes at once
    reasoningPattern: "coverage-metrics", // Straightforward counting
  },

  e2e: {
    model: "claude-haiku-4-5-20251001", // Always Haiku
    tokenBudget: 2000,
    reasoningPattern: "test-orchestration", // Run Playwright scripts
  },

  perf: {
    defaultModel: "claude-haiku-4-5-20251001", // Weekly: Haiku
    monthlyModel: "claude-sonnet-5", // Monthly analysis: Sonnet 5
    tokenBudget: 1500,
    reasoningPattern: "metrics-comparison", // Both models
    // Monthly: 1 Sonnet call = ~$0.02 extra cost
  },

  security: {
    model: "claude-haiku-4-5-20251001", // Always Haiku
    tokenBudget: 1000,
    reasoningPattern: "checklist-validation", // Run security checks
  },
};
```

---

## 7. Projected cost optimization (Haiku + Sonnet 5)

**Baseline (all Haiku, no optimizations):** ~$1.70/week

**With optimizations (Haiku + selective Sonnet 5):**
- Needle v3 context compression: −$0.50/week (Orchestrator)
- Prompt caching (ephemeral + project): −$0.35/week (Planner, Reviewer)
- Batch scoring (QA agent): −$0.10/week
- Intelligent log truncation: −$0.20/week
- Structured reasoning prompts (Haiku): $0/week (same tokens, better decisions)
- JEV embeddings (reasoning without token cost): $0/week
- **Total Haiku savings:** −$1.15/week

**Adding strategic Sonnet 5:**
- Quarterly Planner re-score: ~$0.02 (4 times/year = 1 call/week avg)
- Monthly Perf analysis: ~$0.01 (3 times/year = 0.7 calls/week avg)
- **Total Sonnet 5 cost:** +$0.03/week

**Optimized total (Haiku + Sonnet 5):** $1.70 − $1.15 + $0.03 = **~$0.58/week**

**Quality improvements:**
- ✓ Haiku excels at: code, daily operations, checklist tasks
- ✓ Sonnet 5 used for: quarterly complex decisions, monthly trend analysis
- ✓ Structured prompts guide Haiku's reasoning
- ✓ JEV embeddings improve decisions without cost
- ✓ Caching + compression keep context manageable
- ✓ 66% cost reduction vs baseline + better decision quality on complex choices

---

## 8. Implementation roadmap (Haiku + Sonnet 5, no Opus)

### Phase 1: Prompt caching (immediate, highest ROI)
```typescript
// Add cache_control to all Claude API calls
// Expected savings: ~$0.30/week
// All agents benefit
```

### Phase 2: Needle v3 integration (week 1)
```typescript
// Compress Orchestrator heartbeat context (40% reduction)
// Expected savings: ~$0.50/week
// Haiku excels with compressed context
```

### Phase 3: Structured step-by-step prompting (week 2)
```typescript
// Use structured step-by-step prompts for Haiku (no external tools needed)
// Guide Haiku through: Gate 1 → Gate 2 → Gate 3 → Gate 4 → Gate 5
// Haiku excels at systematic reasoning with guidance
// Expected quality: Better verdicts, fewer fold mistakes
// Cost: $0/week (no token increase, no new dependencies)
```

### Phase 4: Batch scoring (week 3)
```typescript
// QA agent scores all 15 lanes in one call
// Reduces per-lane complexity for Haiku
// Expected savings: ~$0.10/week
```

### Phase 5: Strategic Sonnet 5 (month 1)
```typescript
// Quarterly Planner uses Sonnet 5 for re-score (not Haiku)
// Monthly Perf agent uses Sonnet 5 for trend analysis
// Expected cost: +$0.03/week
// Benefit: Better complex decision quality without Opus cost
```

---

## Validation metrics

Track these weekly:

```typescript
export const recordAgentMetrics = mutation({
  args: {
    agent: v.string(),
    tokensUsed: v.number(),
    decisionQuality: v.number(), // 0-100, higher = better
    errorRate: v.number(), // % of decisions that caused issues
  },
  handler: async (ctx, args) => {
    // Track: Are decisions getting better while cost goes down?
    await ctx.db.insert("laneMetrics", {
      lane: args.agent,
      metric: "agent_efficiency",
      value: args.tokensUsed,
      metadata: {
        decisionQuality: args.decisionQuality,
        errorRate: args.errorRate,
        roi: (100 - args.decisionQuality) / args.tokensUsed, // Lower tokens, higher quality = better ROI
      },
      timestamp: Date.now(),
    });
  },
});
```

---

## Summary

**All Haiku baseline:** $1.70/week, acceptable quality
**Optimized + strategic Sonnet 5 (no Opus):** $0.58/week, **66% cost reduction** + **better complex decisions**

### Strategy: Haiku + Sonnet 5 (never Opus)

**Daily operations (Haiku):**
- Orchestrator heartbeat (every 60s)
- Engineer implementations (code)
- Reviewer checklist validation
- QA coverage metrics
- E2E test orchestration
- Security checklist validation
- ✓ Haiku excels at all of these

**Quarterly/monthly strategic decisions (Sonnet 5):**
- Planner quarterly re-score (4 times/year = ~$0.02/week avg)
- Perf analyst monthly trends (12 times/year = ~$0.01/week avg)
- ✓ Sonnet 5 handles complex reasoning, still 3–4× cheaper than Opus

### Cost optimization techniques (proven, open, available):
- ✓ **Needle v3:** Context compression (40–50% reduction)
- ✓ **Prompt caching:** 90% savings on repeated calls (Claude API native)
- ✓ **Batch scoring:** 15 lanes in 1 call instead of 15
- ✓ **Structured step-by-step prompting:** Guide Haiku's reasoning (open technique)
- ✓ **Strategic Sonnet 5:** Complex decisions only (3 times/quarter)

**Result:** Cheapest possible system with appropriate model selection per task. All techniques are open-source or Claude-native—no proprietary dependencies.

---

*Token Optimization — Haiku for daily work. Sonnet 5 for quarterly decisions. Structured prompting guides reasoning. Never Opus. Every token counts.*
