import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// QA Agent: Track test coverage, detect flaky tests, validate quality gates
export const recordTestCoverage = mutation({
  args: {
    lane: v.string(),
    coverage: v.number(), // percentage 0-100
    uncoveredLines: v.number(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "test_coverage",
      value: args.coverage,
      timestamp: args.timestamp || Date.now(),
      metadata: { uncoveredLines: args.uncoveredLines },
    });

    return { metricId, lane: args.lane, coverage: args.coverage };
  },
});

export const recordFlakyTest = mutation({
  args: {
    lane: v.string(),
    testName: v.string(),
    failureCount: v.number(),
    totalRuns: v.number(),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "flaky_test",
      value: args.failureCount / args.totalRuns,
      timestamp: Date.now(),
      metadata: {
        testName: args.testName,
        failureCount: args.failureCount,
        totalRuns: args.totalRuns,
      },
    });

    return { flagged: args.failureCount >= 2, metricId };
  },
});

// E2E Agent: Track E2E test results per lane
export const recordE2ETestResult = mutation({
  args: {
    lane: v.string(),
    testFlow: v.string(), // e.g., "signup_to_login"
    passed: v.boolean(),
    durationMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "e2e_test",
      value: args.passed ? 1 : 0,
      timestamp: Date.now(),
      metadata: {
        testFlow: args.testFlow,
        durationMs: args.durationMs,
        error: args.error,
      },
    });

    return { recorded: true, passed: args.passed, metricId };
  },
});

export const getE2EResults = query({
  args: {
    lane: v.string(),
    hoursBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursBack = args.hoursBack || 24;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    const results = await ctx.db
      .query("laneMetrics")
      .withIndex("by_lane", (q) => q.eq("lane", args.lane))
      .take(1000);

    const e2eTests = results.filter(
      (m) =>
        m.metric === "e2e_test" &&
        m.timestamp >= cutoffTime
    );

    const passed = e2eTests.filter((m) => m.value === 1).length;
    const failed = e2eTests.filter((m) => m.value === 0).length;
    const passRate = e2eTests.length > 0 ? (passed / e2eTests.length) * 100 : 0;

    return {
      lane: args.lane,
      total: e2eTests.length,
      passed,
      failed,
      passRate: Math.round(passRate),
      tests: e2eTests,
    };
  },
});

// Perf Agent: Track performance baselines and regressions
export const recordPerfBaseline = mutation({
  args: {
    lane: v.string(),
    metric: v.string(), // e.g., "auth_login_p99"
    valueMs: v.number(),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: `perf_${args.metric}`,
      value: args.valueMs,
      timestamp: Date.now(),
    });

    return { baselineSet: true, metricId };
  },
});

export const getPerfRegression = query({
  args: {
    lane: v.string(),
    metric: v.string(),
    hoursBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursBack = args.hoursBack || 24;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;
    const fullMetricName = `perf_${args.metric}`;

    const dataPoints = await ctx.db
      .query("laneMetrics")
      .withIndex("by_lane", (q) => q.eq("lane", args.lane))
      .take(1000);

    const perfMetrics = dataPoints
      .filter(
        (m) =>
          m.metric === fullMetricName &&
          m.timestamp >= cutoffTime
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    if (perfMetrics.length < 2) {
      return { hasRegression: false, dataPoints: perfMetrics };
    }

    const baseline = perfMetrics[0].value;
    const latest = perfMetrics[perfMetrics.length - 1].value;
    const regressionPercent = ((latest - baseline) / baseline) * 100;
    const isRegression = regressionPercent > 10; // >10% slower = regression

    return {
      metric: fullMetricName,
      baseline,
      latest,
      regressionPercent: Math.round(regressionPercent * 10) / 10,
      hasRegression: isRegression,
      dataPoints: perfMetrics,
    };
  },
});

// Security Agent: Track security validation results
export const recordSecurityCheck = mutation({
  args: {
    lane: v.string(),
    checkType: v.union(
      v.literal("validators"),
      v.literal("rbac"),
      v.literal("secrets"),
      v.literal("xss"),
      v.literal("pii"),
    ),
    passed: v.boolean(),
    findings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: `security_${args.checkType}`,
      value: args.passed ? 1 : 0,
      timestamp: Date.now(),
      metadata: { findings: args.findings },
    });

    return { checkType: args.checkType, passed: args.passed, metricId };
  },
});

export const getSecurityStatus = query({
  args: {
    lane: v.string(),
    hoursBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursBack = args.hoursBack || 24;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    const results = await ctx.db
      .query("laneMetrics")
      .withIndex("by_lane", (q) => q.eq("lane", args.lane))
      .take(1000);

    const securityMetrics = results.filter(
      (m) =>
        m.metric.startsWith("security_") &&
        m.timestamp >= cutoffTime
    );

    const checksByType: Record<string, { passed: number; failed: number }> = {
      validators: { passed: 0, failed: 0 },
      rbac: { passed: 0, failed: 0 },
      secrets: { passed: 0, failed: 0 },
      xss: { passed: 0, failed: 0 },
      pii: { passed: 0, failed: 0 },
    };

    securityMetrics.forEach((metric) => {
      const checkType = metric.metric.replace("security_", "");
      if (metric.value === 1) {
        checksByType[checkType].passed++;
      } else {
        checksByType[checkType].failed++;
      }
    });

    const allPassed = securityMetrics.every((m) => m.value === 1);

    return {
      lane: args.lane,
      allPassed,
      checksByType,
      metrics: securityMetrics,
    };
  },
});

// ============================================================================
// DETERMINISTIC GATE FUNCTIONS (Model Proposes, Harness Certifies)
// ============================================================================

// SyntaxGate: Validate code structural integrity
export const recordSyntaxValidation = mutation({
  args: {
    workItemId: v.string(),
    lane: v.string(),
    passed: v.boolean(),
    errorMessage: v.optional(v.string()),
    code: v.optional(v.string()), // For fingerprinting
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "gate_syntax",
      value: args.passed ? 1 : 0,
      timestamp: args.timestamp || Date.now(),
      metadata: {
        workItemId: args.workItemId,
        error: args.errorMessage,
        gateType: "syntax",
      },
    });
    return { gateType: "syntax", passed: args.passed, metricId };
  },
});

// RepeatGate: Detect hallucination cycles via SHA-256 fingerprinting
export const recordRepeatDetection = mutation({
  args: {
    workItemId: v.string(),
    lane: v.string(),
    contentHash: v.string(), // SHA-256 of submitted code
    isDuplicate: v.boolean(), // true if hash seen before
    previousTurns: v.optional(v.array(v.number())), // turns where same hash appeared
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "gate_repeat",
      value: args.isDuplicate ? 0 : 1, // Pass if NOT duplicate
      timestamp: args.timestamp || Date.now(),
      metadata: {
        workItemId: args.workItemId,
        contentHash: args.contentHash,
        isDuplicate: args.isDuplicate,
        previousTurns: args.previousTurns || [],
        gateType: "repeat",
      },
    });
    return {
      gateType: "repeat",
      passed: !args.isDuplicate,
      metricId,
    };
  },
});

// DiffGate: Check for production keys, destructive commands, path safety
export const recordDiffGateResult = mutation({
  args: {
    workItemId: v.string(),
    lane: v.string(),
    passed: v.boolean(),
    issues: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("production_key"),
            v.literal("destructive_command"),
            v.literal("sensitive_path"),
            v.literal("directory_traversal")
          ),
          description: v.string(),
          location: v.string(), // e.g., ".env.local:3"
        })
      )
    ),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "gate_diff",
      value: args.passed ? 1 : 0,
      timestamp: args.timestamp || Date.now(),
      metadata: {
        workItemId: args.workItemId,
        issues: args.issues || [],
        gateType: "diff",
      },
    });
    return { gateType: "diff", passed: args.passed, metricId };
  },
});

// CompilationGate: Validate TypeScript/build compilation
export const recordCompilationResult = mutation({
  args: {
    workItemId: v.string(),
    lane: v.string(),
    passed: v.boolean(),
    errors: v.optional(
      v.array(
        v.object({
          file: v.string(),
          line: v.number(),
          message: v.string(),
        })
      )
    ),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "gate_compile",
      value: args.passed ? 1 : 0,
      timestamp: args.timestamp || Date.now(),
      metadata: {
        workItemId: args.workItemId,
        errors: args.errors || [],
        gateType: "compile",
      },
    });
    return { gateType: "compile", passed: args.passed, metricId };
  },
});

// ObjectiveGate: Validate work item completion objectives
export const recordObjectiveValidation = mutation({
  args: {
    workItemId: v.string(),
    lane: v.string(),
    objectives: v.array(
      v.object({
        name: v.string(),
        required: v.boolean(),
        passed: v.boolean(),
        reason: v.optional(v.string()),
      })
    ),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allPassed = args.objectives.every((o) => !o.required || o.passed);
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: "gate_objective",
      value: allPassed ? 1 : 0,
      timestamp: args.timestamp || Date.now(),
      metadata: {
        workItemId: args.workItemId,
        objectives: args.objectives,
        gateType: "objective",
      },
    });
    return { gateType: "objective", passed: allPassed, metricId };
  },
});

// Track gate failure count for FailChain escalation
export const getGateFailureCount = query({
  args: {
    workItemId: v.string(),
    gateType: v.optional(v.string()), // "syntax", "diff", "compile", etc.
  },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("laneMetrics")
      .withIndex("by_lane", (q) =>
        q.eq("lane", "global") // May need to adjust index
      )
      .take(1000);

    const relevantMetrics = metrics.filter((m) => {
      const isMine = m.metadata?.workItemId === args.workItemId;
      const isGate = m.metric.startsWith("gate_");
      const typeMatch = !args.gateType || m.metric === `gate_${args.gateType}`;
      return isMine && isGate && typeMatch;
    });

    const failureCount = relevantMetrics.filter((m) => m.value === 0).length;
    const consecutiveFailures = relevantMetrics
      .reverse()
      .findIndex((m) => m.value === 1);
    const isConsecutive =
      consecutiveFailures === -1 || consecutiveFailures > 2;

    return {
      workItemId: args.workItemId,
      gateType: args.gateType || "all",
      totalFailures: failureCount,
      consecutiveFailures: isConsecutive
        ? consecutiveFailures === -1
          ? relevantMetrics.length
          : consecutiveFailures
        : 0,
      escalationLevel:
        isConsecutive && consecutiveFailures > 2
          ? "critical"
          : isConsecutive && consecutiveFailures > 1
            ? "stern"
            : "gentle",
    };
  },
});

// ============================================================================
// Quality Gate Enforcement
export const checkQualityGates = query({
  args: {
    lane: v.string(),
  },
  handler: async (ctx, args) => {
    // Get latest metrics for this lane
    const metrics = await ctx.db
      .query("laneMetrics")
      .withIndex("by_lane", (q) => q.eq("lane", args.lane))
      .order("desc")
      .take(500);

    // Coverage target from TEST_STRATEGY.md
    const coverageTargets: Record<string, number> = {
      Auth: 95,
      Mail: 90,
      Forms: 85,
      Status: 85,
      API: 90,
      Automations: 80,
      Sign: 85,
      Docs: 80,
      CRM: 85,
      Sched: 80,
      Designs: 75,
      Sites: 80,
      Blog: 75,
      Help: 75,
      Vault: 90,
    };

    const target = coverageTargets[args.lane] || 80;

    // Get latest coverage, E2E pass rate, perf baseline
    const latestCoverage = metrics.find((m) => m.metric === "test_coverage");
    const e2eTests = metrics.filter((m) => m.metric === "e2e_test");
    const perfMetrics = metrics.filter((m) => m.metric.startsWith("perf_"));
    const securityChecks = metrics.filter((m) =>
      m.metric.startsWith("security_")
    );

    const e2ePassRate =
      e2eTests.length > 0
        ? (e2eTests.filter((m) => m.value === 1).length / e2eTests.length) *
          100
        : 0;
    const securityAllPass = securityChecks.every((m) => m.value === 1);

    const gates = {
      coverage: {
        target,
        actual: latestCoverage?.value || 0,
        pass: (latestCoverage?.value || 0) >= target,
      },
      e2e: {
        target: 100,
        actual: Math.round(e2ePassRate),
        pass: e2ePassRate === 100,
      },
      security: {
        pass: securityAllPass,
      },
    };

    const allPass = gates.coverage.pass && gates.e2e.pass && gates.security.pass;

    return {
      lane: args.lane,
      gates,
      blockDeployment: !allPass,
      summary: allPass
        ? "✓ All quality gates pass. Ready for deployment."
        : "✗ Quality gates failed. See details.",
    };
  },
});

// Dashboard: Overall fleet quality status
export const getFleetQualityStatus = query({
  args: {},
  handler: async (ctx, args) => {
    const lanes = [
      "Auth",
      "Mail",
      "Forms",
      "Status",
      "API",
      "Automations",
      "Sign",
      "Docs",
      "CRM",
      "Sched",
      "Designs",
      "Sites",
      "Blog",
      "Help",
      "Vault",
    ];

    const laneStatus = await Promise.all(
      lanes.map(async (lane) => {
        const gates = await ctx.db
          .query("laneMetrics")
          .withIndex("by_lane", (q) => q.eq("lane", lane))
          .take(100);

        const coverage = gates.find((m) => m.metric === "test_coverage");
        const e2e = gates.filter((m) => m.metric === "e2e_test");
        const e2eRate =
          e2e.length > 0
            ? (e2e.filter((m) => m.value === 1).length / e2e.length) * 100
            : 0;

        return {
          lane,
          coverage: coverage?.value || 0,
          e2ePassRate: Math.round(e2eRate),
          healthy:
            (coverage?.value || 0) >= 75 &&
            e2eRate === 100,
        };
      })
    );

    const healthyLanes = laneStatus.filter((s) => s.healthy).length;

    return {
      total: lanes.length,
      healthy: healthyLanes,
      healthPercent: Math.round((healthyLanes / lanes.length) * 100),
      lanes: laneStatus,
    };
  },
});
