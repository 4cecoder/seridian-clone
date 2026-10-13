import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: {
    startAfter: v.optional(v.string()),
    startBefore: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.clientId) {
      return await ctx.db
        .query("bookings")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
        .order("asc")
        .take(500);
    }
    return await ctx.db.query("bookings").order("asc").take(500);
  },
});

export const get = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.bookingId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    clientId: v.id("clients"),
    startTime: v.string(),
    endTime: v.string(),
    type: v.union(
      v.literal("consultation"),
      v.literal("development"),
      v.literal("review"),
    ),
    notes: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.insert("bookings", args);
  },
});

export const update = mutation({
  args: {
    bookingId: v.id("bookings"),
    title: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("consultation"),
        v.literal("development"),
        v.literal("review"),
      ),
    ),
    notes: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { bookingId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(bookingId, nonUndefined);
    return bookingId;
  },
});

export const remove = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.bookingId);
  },
});
