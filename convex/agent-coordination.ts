import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Work item lifecycle functions
export const claimWorkItem = mutation({
  args: {
    workItemId: v.id("agentWorkItems"),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.workItemId);
    if (!item) throw new Error("Work item not found");
    if (item.status !== "pending") throw new Error("Work item not available");

    await ctx.db.patch(args.workItemId, {
      status: "claimed",
      claimedBy: args.agentId,
      claimedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { itemId: args.workItemId, claimedAt: Date.now() };
  },
});

export const updateWorkItemProgress = mutation({
  args: {
    workItemId: v.id("agentWorkItems"),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    result: v.optional(
      v.object({
        summary: v.string(),
        output: v.optional(v.string()),
        metrics: v.optional(v.record(v.string(), v.any())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workItemId, {
      status: args.status,
      ...(args.status === "completed" && { completedAt: Date.now() }),
      ...(args.result && { result: args.result }),
      updatedAt: Date.now(),
    });

    return { updated: true, completedAt: args.status === "completed" ? Date.now() : undefined };
  },
});

// Query pending work for a given agent role/lane combo
export const getPendingWork = query({
  args: {
    lane: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const query = ctx.db.query("agentWorkItems").withIndex("by_status", (q) => q.eq("status", "pending"));

    const items = args.lane
      ? await query
          .withIndex("by_status_and_lane", (q) =>
            q.eq("status", "pending").eq("lane", args.lane),
          )
          .take(limit)
      : await query.take(limit);

    return items;
  },
});

export const getWorkItemDependencies = query({
  args: {
    workItemId: v.id("agentWorkItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.workItemId);
    if (!item) return null;

    const dependencies = await Promise.all(
      item.dependencies.map((depId) => ctx.db.get(depId)),
    );
    const blockedBy = await Promise.all(item.blockedBy.map((depId) => ctx.db.get(depId)));

    return {
      item,
      dependencies: dependencies.filter((d) => d !== null),
      blockedBy: blockedBy.filter((b) => b !== null),
      canStart:
        item.status === "pending" &&
        blockedBy.every((b) => b && b.status === "completed"),
    };
  },
});

// Agent checkpoint tracking
export const logCheckpoint = mutation({
  args: {
    agent: v.string(),
    checkpointType: v.union(
      v.literal("heartbeat"),
      v.literal("task_start"),
      v.literal("task_complete"),
      v.literal("error"),
    ),
    message: v.string(),
    laneContext: v.optional(v.string()),
    metrics: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const checkpointId = await ctx.db.insert("agentCheckpoints", {
      agent: args.agent,
      checkpointType: args.checkpointType,
      message: args.message,
      laneContext: args.laneContext,
      metrics: args.metrics,
      timestamp: Date.now(),
    });

    return { checkpointId };
  },
});

export const getAgentHeartbeats = query({
  args: {
    agent: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const query = ctx.db.query("agentCheckpoints").order("desc");

    const items = args.agent
      ? await query
          .withIndex("by_agent_and_timestamp", (q) => q.eq("agent", args.agent))
          .take(limit)
      : await query.take(limit);

    return items;
  },
});

// Lane metrics tracking
export const recordLaneMetric = mutation({
  args: {
    lane: v.string(),
    metric: v.string(),
    value: v.number(),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const metricId = await ctx.db.insert("laneMetrics", {
      lane: args.lane,
      metric: args.metric,
      value: args.value,
      metadata: args.metadata,
      timestamp: Date.now(),
    });

    return { metricId };
  },
});

export const getLaneMetrics = query({
  args: {
    lane: v.string(),
    metric: v.optional(v.string()),
    hoursBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursBack = args.hoursBack || 24;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    let query = ctx.db.query("laneMetrics").withIndex("by_lane", (q) => q.eq("lane", args.lane));

    const metrics = await query.take(1000);
    return metrics.filter((m) => m.timestamp >= cutoffTime && (!args.metric || m.metric === args.metric));
  },
});

// Agent config management
export const registerAgent = mutation({
  args: {
    agentId: v.string(),
    role: v.union(
      v.literal("orchestrator"),
      v.literal("planner"),
      v.literal("engineer"),
      v.literal("reviewer"),
      v.literal("integrator"),
      v.literal("analyst"),
    ),
    lanes: v.array(v.string()),
    capabilities: v.array(v.string()),
    maxConcurrentTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentConfig")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        lanes: args.lanes,
        capabilities: args.capabilities,
        maxConcurrentTasks: args.maxConcurrentTasks,
        active: true,
      });
      return { agentId: args.agentId, registered: true, updated: true };
    }

    const configId = await ctx.db.insert("agentConfig", {
      agentId: args.agentId,
      role: args.role,
      lanes: args.lanes,
      capabilities: args.capabilities,
      maxConcurrentTasks: args.maxConcurrentTasks,
      active: true,
    });

    return { agentId: args.agentId, registered: true, configId };
  },
});

export const getAgentConfig = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConfig")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
  },
});

export const getAgentsByRole = query({
  args: {
    role: v.union(
      v.literal("orchestrator"),
      v.literal("planner"),
      v.literal("engineer"),
      v.literal("reviewer"),
      v.literal("integrator"),
      v.literal("analyst"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConfig")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .filter((q) => q.eq(q.field("active"), true))
      .take(100);
  },
});

// Create new work item (used by planner/orchestrator agents)
export const createWorkItem = mutation({
  args: {
    workType: v.union(
      v.literal("analysis"),
      v.literal("planning"),
      v.literal("implementation"),
      v.literal("review"),
      v.literal("integration"),
      v.literal("metrics"),
    ),
    lane: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
    ),
    dependencies: v.optional(v.array(v.id("agentWorkItems"))),
  },
  handler: async (ctx, args) => {
    const itemId = await ctx.db.insert("agentWorkItems", {
      workType: args.workType,
      lane: args.lane,
      title: args.title,
      description: args.description,
      status: "pending",
      priority: args.priority,
      dependencies: args.dependencies || [],
      blockedBy: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { itemId };
  },
});

export const getWorkStatus = query({
  args: {
    lane: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db.query("agentWorkItems");
    const allItems = args.lane
      ? await query.withIndex("by_lane", (q) => q.eq("lane", args.lane)).take(1000)
      : await query.take(1000);

    const byStatus = {
      pending: 0,
      claimed: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    };

    allItems.forEach((item) => {
      byStatus[item.status]++;
    });

    return {
      total: allItems.length,
      byStatus,
      items: allItems,
    };
  },
});
