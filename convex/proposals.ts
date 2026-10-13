import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("expired"),
);

export const list = query({
  args: {
    status: v.optional(statusValidator),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.status) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(500);
    }
    if (args.clientId) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
        .order("desc")
        .take(500);
    }
    return await ctx.db.query("proposals").order("desc").take(500);
  },
});

export const get = query({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.proposalId);
  },
});

export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("proposals")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(500);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    clientId: v.optional(v.id("clients")),
    content: v.string(),
    status: statusValidator,
    value: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = Date.now();
    return await ctx.db.insert("proposals", {
      title: args.title,
      clientId: args.clientId,
      content: args.content,
      status: args.status,
      value: args.value,
      validUntil: args.validUntil,
      sentAt: args.sentAt,
      acceptedAt: args.acceptedAt,
      notes: args.notes,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    proposalId: v.id("proposals"),
    title: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    content: v.optional(v.string()),
    status: v.optional(statusValidator),
    value: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { proposalId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(proposalId, {
      ...nonUndefined,
      updatedAt: Date.now(),
    });
    return proposalId;
  },
});

export const remove = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.proposalId);
  },
});

export const send = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
    });
    return args.proposalId;
  },
});

export const accept = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    return args.proposalId;
  },
});

export const reject = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "rejected",
      updatedAt: now,
    });
    return args.proposalId;
  },
});
