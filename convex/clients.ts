import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.status) {
      return await ctx.db
        .query("clients")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(500);
    }
    return await ctx.db.query("clients").order("desc").take(500);
  },
});

export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.clientId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    company: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.insert("clients", args);
  },
});

export const update = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { clientId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(clientId, nonUndefined);
    return clientId;
  },
});

export const remove = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.clientId);
  },
});
