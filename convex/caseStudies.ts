import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

export const list = query({
  args: {
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.published !== undefined) {
      return await ctx.db
        .query("caseStudies")
        .withIndex("by_published", (q) => q.eq("published", args.published!))
        .order("desc")
        .take(500);
    }
    return await ctx.db.query("caseStudies").order("desc").take(500);
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("caseStudies")
      .withIndex("by_published", (q) => q.eq("published", true))
      .order("desc")
      .take(500);
  },
});

export const get = query({
  args: { caseStudyId: v.id("caseStudies") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.caseStudyId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    clientId: v.optional(v.id("clients")),
    summary: v.string(),
    challenge: v.string(),
    solution: v.string(),
    results: v.string(),
    technologies: v.array(v.string()),
    industry: v.string(),
    imageUrl: v.optional(v.string()),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const existing = await ctx.db.query("caseStudies").order("desc").take(1);
    const maxOrder = existing.length > 0 ? existing[0].order + 1 : 0;
    return await ctx.db.insert("caseStudies", { ...args, order: maxOrder });
  },
});

export const update = mutation({
  args: {
    caseStudyId: v.id("caseStudies"),
    title: v.optional(v.string()),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    summary: v.optional(v.string()),
    challenge: v.optional(v.string()),
    solution: v.optional(v.string()),
    results: v.optional(v.string()),
    technologies: v.optional(v.array(v.string())),
    industry: v.optional(v.string()),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    published: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { caseStudyId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(caseStudyId, nonUndefined);
    return caseStudyId;
  },
});

export const remove = mutation({
  args: { caseStudyId: v.id("caseStudies") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.caseStudyId);
  },
});

export const count = query({
  args: {
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.published !== undefined) {
      const studies = await ctx.db
        .query("caseStudies")
        .withIndex("by_published", (q) => q.eq("published", args.published!))
        .take(1000);
      return studies.length;
    }
    const all = await ctx.db.query("caseStudies").take(1000);
    return all.length;
  },
});
