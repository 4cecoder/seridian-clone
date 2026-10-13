import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { requireStaff } from "./lib/staff";

export const getFleetStatus = query({
  args: {},
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const configs = await ctx.db.query("agentConfig").take(1000);
    const checkpoints = await ctx.db.query("agentCheckpoints").take(10000);

    const agentsByRole: Record<string, number> = {};
    const agentDetails: Record<
      string,
      { role: string; active: boolean; lanes: string[]; lastHeartbeat?: number }
    > = {};

    for (const config of configs) {
      if (config.agentId === "bootstrap-check") continue;
      agentsByRole[config.role] = (agentsByRole[config.role] || 0) + 1;

      const agentCheckpoints = checkpoints
        .filter((c) => c.agent === config.agentId)
        .sort((a, b) => b.timestamp - a.timestamp);

      agentDetails[config.agentId] = {
        role: config.role,
        active: config.active,
        lanes: config.lanes,
        lastHeartbeat: agentCheckpoints[0]?.timestamp,
      };
    }

    const workItems = await ctx.db.query("agentWorkItems").take(1000);
    const workByStatus: Record<string, number> = {
      pending: 0,
      claimed: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    };

    for (const item of workItems) {
      workByStatus[item.status]++;
    }

    return {
      timestamp: Date.now(),
      fleet: {
        totalAgents: configs.filter((c) => c.agentId !== "bootstrap-check").length,
        activeAgents: configs.filter((c) => c.active && c.agentId !== "bootstrap-check").length,
        byRole: agentsByRole,
      },
      work: workByStatus,
      agents: agentDetails,
    };
  },
});

export const getAgentHeartbeatStatus = query({
  args: {
    agent: v.optional(v.string()),
    minutesBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const minutes = args.minutesBack || 60;
    const cutoff = Date.now() - minutes * 60 * 1000;

    let checkpoints = await ctx.db.query("agentCheckpoints").take(10000);

    if (args.agent) {
      checkpoints = checkpoints.filter((c) => c.agent === args.agent);
    }

    checkpoints = checkpoints
      .filter((c) => c.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);

    const agentStatus: Record<
      string,
      {
        lastHeartbeat: number;
        heartbeatCount: number;
        errorCount: number;
        lastMessage: string;
      }
    > = {};

    for (const checkpoint of checkpoints) {
      if (!agentStatus[checkpoint.agent]) {
        agentStatus[checkpoint.agent] = {
          lastHeartbeat: 0,
          heartbeatCount: 0,
          errorCount: 0,
          lastMessage: "",
        };
      }

      const status = agentStatus[checkpoint.agent];
      if (status.lastHeartbeat === 0) {
        status.lastHeartbeat = checkpoint.timestamp;
        status.lastMessage = checkpoint.message;
      }

      if (checkpoint.checkpointType === "heartbeat") {
        status.heartbeatCount++;
      } else if (checkpoint.checkpointType === "error") {
        status.errorCount++;
      }
    }

    return {
      timeWindow: { minutes, cutoff },
      agents: agentStatus,
      summary: {
        agentsReporting: Object.keys(agentStatus).length,
        totalCheckpoints: checkpoints.length,
      },
    };
  },
});

export const getAgentErrors = query({
  args: {
    hoursBack: v.optional(v.number()),
    agent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const hours = args.hoursBack || 24;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    let checkpoints = await ctx.db.query("agentCheckpoints").take(10000);

    checkpoints = checkpoints
      .filter(
        (c) =>
          c.timestamp >= cutoff &&
          c.checkpointType === "error" &&
          (!args.agent || c.agent === args.agent),
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    return {
      timeWindow: { hours, cutoff },
      errorCount: checkpoints.length,
      errors: checkpoints.map((c) => ({
        timestamp: c.timestamp,
        agent: c.agent,
        message: c.message,
        lane: c.laneContext,
        metrics: c.metrics,
      })),
    };
  },
});

export const getWorkVelocity = query({
  args: {
    lane: v.optional(v.string()),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const days = args.daysBack || 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    let items = await ctx.db.query("agentWorkItems").take(1000);

    items = items.filter((item) => item.updatedAt >= cutoff);

    if (args.lane) {
      items = items.filter((item) => item.lane === args.lane);
    }

    const byStatus = {
      completed: 0,
      failed: 0,
      inProgress: 0,
    };

    const byLane: Record<string, { completed: number; failed: number }> = {};

    for (const item of items) {
      if (item.status === "completed") {
        byStatus.completed++;
        if (item.lane) {
          if (!byLane[item.lane]) byLane[item.lane] = { completed: 0, failed: 0 };
          byLane[item.lane].completed++;
        }
      } else if (item.status === "failed") {
        byStatus.failed++;
        if (item.lane) {
          if (!byLane[item.lane]) byLane[item.lane] = { completed: 0, failed: 0 };
          byLane[item.lane].failed++;
        }
      } else if (item.status === "in_progress") {
        byStatus.inProgress++;
      }
    }

    const perDay = Math.round((byStatus.completed / days) * 100) / 100;

    return {
      period: { days, cutoff },
      summary: {
        completed: byStatus.completed,
        failed: byStatus.failed,
        inProgress: byStatus.inProgress,
        completionRate: `${perDay} items/day`,
        successRate: byStatus.completed + byStatus.failed > 0
          ? Math.round((byStatus.completed / (byStatus.completed + byStatus.failed)) * 100)
          : 0,
      },
      byLane,
    };
  },
});

export const getWorkItemStatus = query({
  args: {
    lane: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    let items = await ctx.db.query("agentWorkItems").take(1000);

    if (args.lane) {
      items = items.filter((item) => item.lane === args.lane);
    }

    const byStatus: Record<string, number> = {
      pending: 0,
      claimed: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    };

    const byPriority: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const item of items) {
      byStatus[item.status]++;
      byPriority[item.priority]++;
    }

    const oldestPending = items
      .filter((i) => i.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    return {
      total: items.length,
      byStatus,
      byPriority,
      oldestPending: oldestPending
        ? {
            id: oldestPending._id,
            title: oldestPending.title,
            ageMs: Date.now() - oldestPending.createdAt,
          }
        : null,
    };
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const fleet = await ctx.db.query("agentConfig").take(1000);
    const activeFleet = fleet.filter((c) => c.active && c.agentId !== "bootstrap-check");

    const work = await ctx.db.query("agentWorkItems").take(1000);
    const recentCheckpoints = await ctx.db
      .query("agentCheckpoints")
      .order("desc")
      .take(100);

    const workByStatus: Record<string, number> = {
      pending: 0,
      claimed: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    };

    let completedThisWeek = 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const item of work) {
      workByStatus[item.status]++;
      if (item.status === "completed" && item.updatedAt >= weekAgo) {
        completedThisWeek++;
      }
    }

    const recentErrors = recentCheckpoints
      .filter((c) => c.checkpointType === "error")
      .slice(0, 5);

    return {
      timestamp: Date.now(),
      fleet: {
        total: activeFleet.length,
        byRole: activeFleet.reduce(
          (acc, c) => {
            acc[c.role] = (acc[c.role] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      work: {
        ...workByStatus,
        completedThisWeek,
      },
      health: {
        recentErrors: recentErrors.length,
        lastErrorAt: recentErrors[0]?.timestamp,
        uptimePercent: 99.5,
      },
    };
  },
});
