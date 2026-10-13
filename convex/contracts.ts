import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("contracts")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(500);
  },
});

export const get = query({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.contractId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    clientId: v.id("clients"),
    value: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("completed"),
    ),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.insert("contracts", args);
  },
});

export const update = mutation({
  args: {
    contractId: v.id("contracts"),
    name: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    value: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("completed"),
      ),
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { contractId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(contractId, nonUndefined);
    return contractId;
  },
});

export const remove = mutation({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.contractId);
  },
});
