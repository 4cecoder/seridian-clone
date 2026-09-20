import { mutation, internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

export const launchOrchestrator = internalAction({
  args: {},
  handler: async (ctx, args) => {
    const agentId = `orchestrator-${Date.now()}`;

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "orchestrator",
      lanes: [],
      capabilities: ["heartbeat", "work_assignment", "deadlock_detection"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "heartbeat",
      message: "Orchestrator launched and registered",
    });

    return { agentId, status: "launched" };
  },
});

export const launchPlanner = internalAction({
  args: {
    context: v.union(v.literal("quarterly"), v.literal("wave")),
  },
  handler: async (ctx, args) => {
    const agentId = `planner-${Date.now()}`;

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "planner",
      lanes: [],
      capabilities: ["gate_scoring", "wave_planning", "backlog_generation"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "task_start",
      message: `Planner launched for ${args.context} planning`,
      metadata: { context: args.context },
    });

    return { agentId, context: args.context, status: "launched" };
  },
});

export const launchEngineer = internalAction({
  args: {
    subsystem: v.union(
      v.literal("spine"),
      v.literal("forms"),
      v.literal("crm"),
      v.literal("publish"),
      v.literal("design"),
      v.literal("trust"),
    ),
    workItemId: v.id("agentWorkItems"),
  },
  handler: async (ctx, args) => {
    const agentId = `engineer-${args.subsystem}-${Date.now()}`;
    const subsystemLanes: Record<string, string[]> = {
      spine: ["auth", "mail", "api", "status"],
      forms: ["forms"],
      crm: ["crm", "help"],
      publish: ["blog", "docs"],
      design: ["designs", "sites"],
      trust: ["sign", "vault"],
    };

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "engineer",
      lanes: subsystemLanes[args.subsystem] || [],
      capabilities: ["implementation", "testing", "schema"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "task_start",
      message: `Engineer launched for subsystem ${args.subsystem}`,
      metadata: { subsystem: args.subsystem, workItemId: args.workItemId },
    });

    return { agentId, subsystem: args.subsystem, status: "launched" };
  },
});

export const launchReviewer = internalAction({
  args: {},
  handler: async (ctx, args) => {
    const agentId = `reviewer-${Date.now()}`;

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "reviewer",
      lanes: [],
      capabilities: ["code_review", "convex_patterns", "test_coverage"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "task_start",
      message: "Reviewer launched and watching for completed work",
    });

    return { agentId, status: "launched" };
  },
});

export const launchIntegrator = internalAction({
  args: {
    lane: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agentId = `integrator-${Date.now()}`;

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "integrator",
      lanes: args.lane ? [args.lane] : [],
      capabilities: ["composition_validation", "widget_api", "event_bus"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "task_start",
      message: `Integrator launched${args.lane ? ` for lane ${args.lane}` : ""}`,
      metadata: args.lane ? { lane: args.lane } : {},
    });

    return { agentId, lane: args.lane, status: "launched" };
  },
});

export const launchAnalyst = internalAction({
  args: {
    interval: v.union(v.literal("weekly"), v.literal("quarterly")),
  },
  handler: async (ctx, args) => {
    const agentId = `analyst-${Date.now()}`;

    await ctx.runMutation(internal.agentCoordination.registerAgent, {
      agentId,
      role: "analyst",
      lanes: [],
      capabilities: ["metrics_ingestion", "gate_calculation", "trend_analysis"],
      maxConcurrentTasks: 1,
    });

    await ctx.runMutation(internal.agentCoordination.logCheckpoint, {
      agent: agentId,
      checkpointType: "task_start",
      message: `Analyst launched for ${args.interval} analysis`,
      metadata: { interval: args.interval },
    });

    return { agentId, interval: args.interval, status: "launched" };
  },
});

export const launchAllAgents = action({
  args: {},
  handler: async (ctx, args) => {
    const agents = [];

    agents.push(await ctx.runAction(internal.agentLauncher.launchOrchestrator, {}));
    agents.push(await ctx.runAction(internal.agentLauncher.launchReviewer, {}));
    agents.push(await ctx.runAction(internal.agentLauncher.launchIntegrator, {}));
    agents.push(
      await ctx.runAction(internal.agentLauncher.launchAnalyst, {
        interval: "weekly",
      }),
    );

    const subsystems = ["spine", "forms", "crm", "publish", "design", "trust"];
    for (const subsystem of subsystems) {
      agents.push(
        await ctx.runAction(internal.agentLauncher.launchEngineer, {
          subsystem: subsystem as any,
          workItemId: "placeholder" as any,
        }),
      );
    }

    agents.push(
      await ctx.runAction(internal.agentLauncher.launchPlanner, {
        context: "quarterly",
      }),
    );

    return {
      launchedAgents: agents.length,
      agents,
      timestamp: Date.now(),
    };
  },
});
