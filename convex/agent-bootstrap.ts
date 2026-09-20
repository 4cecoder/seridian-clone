import { mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const LANES = [
  "auth",
  "mail",
  "api",
  "status",
  "forms",
  "crm",
  "blog",
  "docs",
  "designs",
  "sites",
  "automations",
  "sign",
  "vault",
  "help",
  "sched",
];

export const initializeAgentRegistry = mutation({
  args: {},
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentConfig")
      .withIndex("by_agentId", (q) => q.eq("agentId", "bootstrap-check"))
      .unique();

    if (existing) {
      return { initialized: false, message: "Registry already initialized" };
    }

    const bootstrapMarker = await ctx.db.insert("agentConfig", {
      agentId: "bootstrap-check",
      role: "orchestrator",
      lanes: [],
      capabilities: ["marker"],
      maxConcurrentTasks: 0,
      active: false,
      metadata: { bootstrapTime: Date.now() },
    });

    return {
      initialized: true,
      message: "Agent registry initialized",
      markerId: bootstrapMarker,
    };
  },
});

export const seedInitialWorkItems = mutation({
  args: {
    includeTestItem: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existingWork = await ctx.db.query("agentWorkItems").take(1);
    if (existingWork.length > 0) {
      return { seeded: false, message: "Work items already exist; skipping seed" };
    }

    const created: string[] = [];

    for (const lane of LANES) {
      const itemId = await ctx.db.insert("agentWorkItems", {
        workType: "planning",
        lane,
        title: `Q4 Planning: ${lane} gate re-score`,
        description: `Re-score the five gates for ${lane} lane per STRATEGY.md. Determine if LANE/FEATURE/DON'T BUILD.`,
        status: "pending",
        priority: "high",
        dependencies: [],
        blockedBy: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created.push(itemId);
    }

    const foldCandidates = [
      { lane: "blog", reason: "No moat, fold into Docs + Sites" },
      { lane: "help", reason: "Feature of CRM, no own moat" },
      { lane: "vault", reason: "Security-gated, held until review passes" },
    ];

    for (const candidate of foldCandidates) {
      const itemId = await ctx.db.insert("agentWorkItems", {
        workType: "analysis",
        lane: candidate.lane,
        title: `Q4 Fold Investigation: ${candidate.lane}`,
        description: `${candidate.reason}. Analyze growth signals, synergy, and decide fold target.`,
        status: "pending",
        priority: "medium",
        dependencies: [],
        blockedBy: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created.push(itemId);
    }

    if (args.includeTestItem) {
      const testItemId = await ctx.db.insert("agentWorkItems", {
        workType: "implementation",
        lane: "auth",
        title: "TEST ITEM: Auth TOTP implementation",
        description:
          "Add TOTP (Time-based One-Time Password) + backup codes to Auth MFA. Include validators per Convex guidelines.",
        status: "pending",
        priority: "high",
        dependencies: [],
        blockedBy: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created.push(testItemId);
    }

    return {
      seeded: true,
      itemsCreated: created.length,
      items: created,
    };
  },
});

export const seedLaneMetricsBenchmarks = mutation({
  args: {},
  handler: async (ctx, args) => {
    const benchmarks = [
      { lane: "auth", metric: "activation_target", value: 40 },
      { lane: "mail", metric: "activation_target", value: 50 },
      { lane: "forms", metric: "activation_target", value: 50 },
      { lane: "status", metric: "activation_target", value: 45 },
      { lane: "api", metric: "activation_target", value: 60 },
      { lane: "auth", metric: "growth_gate_threshold", value: 0.1 },
      { lane: "mail", metric: "growth_gate_threshold", value: 0.1 },
      { lane: "forms", metric: "growth_gate_threshold", value: 0.1 },
      { lane: "crm", metric: "paid_target", value: 5 },
      { lane: "designs", metric: "mau_target", value: 100 },
    ];

    const created: string[] = [];
    for (const benchmark of benchmarks) {
      const metricId = await ctx.db.insert("laneMetrics", {
        lane: benchmark.lane,
        metric: benchmark.metric,
        value: benchmark.value,
        timestamp: Date.now(),
        metadata: { type: "benchmark", quarter: "Q4" },
      });
      created.push(metricId);
    }

    return {
      benchmarksCreated: created.length,
      metrics: created,
    };
  },
});

export const bootstrapSystem = action({
  args: {
    includeTestItem: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const steps = [];

    const registry = await ctx.runMutation(internal.agentBootstrap.initializeAgentRegistry, {});
    steps.push(registry);

    const work = await ctx.runMutation(internal.agentBootstrap.seedInitialWorkItems, {
      includeTestItem: args.includeTestItem || false,
    });
    steps.push(work);

    const benchmarks = await ctx.runMutation(
      internal.agentBootstrap.seedLaneMetricsBenchmarks,
      {},
    );
    steps.push(benchmarks);

    return {
      bootstrapComplete: true,
      timestamp: Date.now(),
      steps,
      summary: {
        registryInitialized: registry.initialized,
        workItemsSeeded: work.seeded ? work.itemsCreated : 0,
        benchmarksSeeded: benchmarks.benchmarksCreated,
      },
    };
  },
});

export const resetSystemForTesting = mutation({
  args: {},
  handler: async (ctx, args) => {
    const workItems = await ctx.db.query("agentWorkItems").take(10000);
    const checkpoints = await ctx.db.query("agentCheckpoints").take(10000);
    const metrics = await ctx.db.query("laneMetrics").take(10000);
    const configs = await ctx.db.query("agentConfig").take(1000);

    let deleted = 0;

    for (const item of workItems) {
      await ctx.db.delete(item._id);
      deleted++;
    }

    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
      deleted++;
    }

    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
      deleted++;
    }

    for (const config of configs) {
      if (config.agentId !== "bootstrap-check") {
        await ctx.db.delete(config._id);
        deleted++;
      }
    }

    return {
      reset: true,
      itemsDeleted: deleted,
      timestamp: Date.now(),
    };
  },
});
