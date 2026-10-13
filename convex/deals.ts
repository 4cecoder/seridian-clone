import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: {
    stage: v.optional(
      v.union(
        v.literal("lead"),
        v.literal("proposal"),
        v.literal("negotiation"),
        v.literal("closed_won"),
        v.literal("closed_lost"),
      ),
    ),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.stage) {
      return await ctx.db
        .query("deals")
        .withIndex("by_stage", (q) => q.eq("stage", args.stage!))
        .order("desc")
        .take(500);
    }
    if (args.clientId) {
      return await ctx.db
        .query("deals")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
        .order("desc")
        .take(500);
    }
    return await ctx.db.query("deals").order("desc").take(500);
  },
});

export const get = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.dealId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    clientId: v.id("clients"),
    value: v.number(),
    stage: v.union(
      v.literal("lead"),
      v.literal("proposal"),
      v.literal("negotiation"),
      v.literal("closed_won"),
      v.literal("closed_lost"),
    ),
    probability: v.number(),
    expectedCloseDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.insert("deals", args);
  },
});

export const update = mutation({
  args: {
    dealId: v.id("deals"),
    name: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    value: v.optional(v.number()),
    stage: v.optional(
      v.union(
        v.literal("lead"),
        v.literal("proposal"),
        v.literal("negotiation"),
        v.literal("closed_won"),
        v.literal("closed_lost"),
      ),
    ),
    probability: v.optional(v.number()),
    expectedCloseDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { dealId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(dealId, nonUndefined);
    return dealId;
  },
});

export const remove = mutation({
  args: { dealId: v.id("deals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.dealId);
  },
});
