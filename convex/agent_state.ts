import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireStaff } from "./lib/staff";

export const canStartWork = internalQuery({
  args: {
    workItemId: v.id("agentWorkItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.workItemId);
    if (!item) return { canStart: false, reason: "Work item not found" };

    if (item.status !== "pending") {
      return { canStart: false, reason: `Item status is ${item.status}, not pending` };
    }

    if (item.blockedBy.length === 0) {
      return { canStart: true };
    }

    const blockers = await Promise.all(item.blockedBy.map((id) => ctx.db.get(id)));
    const allBlockersComplete = blockers.every((b) => b && b.status === "completed");

    if (!allBlockersComplete) {
      const blockerIds = blockers
        .filter((b) => b && b.status !== "completed")
        .map((b) => b!._id);
      return {
        canStart: false,
        reason: `Blocked by incomplete items: ${blockerIds.join(", ")}`,
        blockedBy: blockerIds,
      };
    }

    return { canStart: true };
  },
});

export const detectDeadlocks = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const items = await ctx.db.query("agentWorkItems").take(1000);
    const limit = args.limit || 1000;

    const adjacency: Record<string, Set<string>> = {};
    items.forEach((item) => {
      const itemId = item._id.toString();
      adjacency[itemId] = new Set(item.dependencies.map((d) => d.toString()));

      item.blockedBy.forEach((blocked) => {
        const blockedId = blocked.toString();
        if (!adjacency[blockedId]) adjacency[blockedId] = new Set();
        adjacency[blockedId].add(itemId);
      });
    });

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]) => {
      if (visited.has(node)) return;
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adjacency[node] || new Set();
      for (const neighbor of neighbors) {
        if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycles.push(cycle);
        } else if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        }
      }

      recStack.delete(node);
    };

    for (const node in adjacency) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return {
      deadlocksDetected: cycles.length > 0,
      cycles: cycles.slice(0, limit),
      totalCycles: cycles.length,
    };
  },
});

export const getWorkItemsStuck = query({
  args: {
    hoursThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const hours = args.hoursThreshold || 2;
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    const items = await ctx.db.query("agentWorkItems").take(1000);
    const stuck = items.filter((item) => {
      return (
        item.status === "in_progress" &&
        item.claimedAt &&
        item.claimedAt < cutoffTime
      );
    });

    return {
      stuckCount: stuck.length,
      items: stuck.map((item) => ({
        id: item._id,
        title: item.title,
        claimedBy: item.claimedBy,
        claimedAtMs: item.claimedAt,
        hoursElapsed: Math.round((Date.now() - (item.claimedAt || 0)) / 60 / 60 / 1000),
      })),
    };
  },
});

export const markStuckItemsFailed = mutation({
  args: {
    hoursThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const hours = args.hoursThreshold || 2;
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    const items = await ctx.db.query("agentWorkItems").take(1000);
    const stuck = items.filter(
      (item) =>
        item.status === "in_progress" &&
        item.claimedAt &&
        item.claimedAt < cutoffTime,
    );

    for (const item of stuck) {
      await ctx.db.patch(item._id, {
        status: "failed",
        result: {
          summary: `Timeout: work stuck for >>${hours} hours`,
          output: undefined,
          metrics: { timedOut: true },
        },
        updatedAt: Date.now(),
      });
    }

    return { marked_failed: stuck.length };
  },
});

export const resolveBlockedItems = mutation({
  args: {
    completedItemId: v.id("agentWorkItems"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const completed = await ctx.db.get(args.completedItemId);
    if (!completed || completed.status !== "completed") {
      return { unblocked: 0 };
    }

    const allItems = await ctx.db.query("agentWorkItems").take(1000);
    const waitingOnThisItem = allItems.filter(
      (item) =>
        item.status === "pending" &&
        item.blockedBy.some((b) => b === args.completedItemId),
    );

    let unblocked = 0;
    for (const waiting of waitingOnThisItem) {
      const updatedBlockedBy = waiting.blockedBy.filter((b) => b !== args.completedItemId);
      await ctx.db.patch(waiting._id, {
        blockedBy: updatedBlockedBy,
        updatedAt: Date.now(),
      });
      unblocked++;
    }

    return { unblocked, itemsAffected: waitingOnThisItem.map((i) => i._id) };
  },
});

export const getWorkDependencyTree = query({
  args: {
    workItemId: v.id("agentWorkItems"),
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const maxDepth = args.depth || 5;
    const root = await ctx.db.get(args.workItemId);
    if (!root) return null;

    const traverse = async (
      itemId: Id<"agentWorkItems">,
      currentDepth: number,
    ): Promise<any> => {
      if (currentDepth >= maxDepth) return null;

      const item = await ctx.db.get(itemId);
      if (!item) return null;

      const deps = await Promise.all(
        item.dependencies.map((depId) => traverse(depId, currentDepth + 1)),
      );
      const blockedByItems = await Promise.all(
        item.blockedBy.map((depId) => traverse(depId, currentDepth + 1)),
      );

      return {
        id: item._id,
        title: item.title,
        status: item.status,
        lane: item.lane,
        dependencies: deps.filter((d) => d !== null),
        blockedBy: blockedByItems.filter((b) => b !== null),
      };
    };

    return traverse(args.workItemId, 0);
  },
});

export const validateWorkItemTransition = query({
  args: {
    workItemId: v.id("agentWorkItems"),
    targetStatus: v.union(
      v.literal("pending"),
      v.literal("claimed"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item) return { valid: false, reason: "Work item not found" };

    const transitions: Record<string, string[]> = {
      pending: ["claimed", "failed"],
      claimed: ["in_progress", "failed"],
      in_progress: ["completed", "failed"],
      completed: [],
      failed: ["pending"],
    };

    const validTargets = transitions[item.status] || [];
    const isValid = validTargets.includes(args.targetStatus);

    return {
      valid: isValid,
      currentStatus: item.status,
      targetStatus: args.targetStatus,
      reason: isValid ? "OK" : `Cannot transition from ${item.status} to ${args.targetStatus}`,
    };
  },
});
