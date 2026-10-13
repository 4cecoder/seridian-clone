import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db.query("channels").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("public"), v.literal("private"), v.literal("direct")),
    createdBy: v.string(),
    participants: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const channelId = await ctx.db.insert("channels", {
      name: args.name,
      description: args.description,
      type: args.type,
      createdBy: args.createdBy,
      participants: args.participants,
      createdAt: Date.now(),
    });
    return channelId;
  },
});

export const get = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.channelId);
  },
});
