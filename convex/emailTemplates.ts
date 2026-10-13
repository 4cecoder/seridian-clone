import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireStaff } from "./lib/staff";

const categoryValidator = v.union(
  v.literal("proposal"),
  v.literal("invoice"),
  v.literal("follow_up"),
  v.literal("welcome"),
  v.literal("custom"),
);

export const list = query({
  args: {
    category: v.optional(categoryValidator),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.category) {
      return await ctx.db
        .query("emailTemplates")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .take(500);
    }
    return await ctx.db.query("emailTemplates").order("desc").take(500);
  },
});

export const get = query({
  args: { templateId: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.templateId);
  },
});

export const getByCategory = query({
  args: { category: categoryValidator },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("emailTemplates")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .order("desc")
      .take(500);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    category: categoryValidator,
    variables: v.array(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = Date.now();
    return await ctx.db.insert("emailTemplates", {
      name: args.name,
      subject: args.subject,
      body: args.body,
      category: args.category,
      variables: args.variables,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(categoryValidator),
    variables: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const { templateId, ...fields } = args;
    const nonUndefined = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(templateId, {
      ...nonUndefined,
      updatedAt: Date.now(),
    });
    return templateId;
  },
});

export const remove = mutation({
  args: { templateId: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    await ctx.db.delete(args.templateId);
  },
});

export const duplicate = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const original = await ctx.db.get(args.templateId);
    if (!original) {
      throw new Error("Template not found");
    }
    const now = Date.now();
    return await ctx.db.insert("emailTemplates", {
      name: args.name,
      subject: original.subject,
      body: original.body,
      category: original.category,
      variables: original.variables,
      createdBy: original.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});
