import { mutation, internalAction, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { requireStaff } from "./lib/staff";

// Each `launchX` below is exported as a standalone Convex action (for external
// or scheduled invocation) but its logic also lives in a plain `doLaunchX`
// helper below it. `launchAllAgents` calls the plain helpers directly instead
// of `ctx.runAction(internal.agent_launcher.launchX, ...)` for the same
// reason `internalUntyped` exists below — see that comment.

// TypeScript fails to resolve `internal.agent_coordination` / `internal.agent_bootstrap`
// from this file specifically, reporting "Property does not exist" against a
// truncated `internal` type showing only `agent_launcher`. Verified this is
// not caused by anything in this file's own code: an isolated probe file with
// zero relationship to agent_launcher.ts, agent_coordination.ts, or
// agent_bootstrap.ts reproduces the exact same error the moment it references
// `internal.agent_coordination`. Also ruled out: same-file self-reference
// (eliminated below via doLaunchX helpers — didn't fix it), module-level
// mutual circularity (moved bootstrapSystem to/from different files — didn't
// fix it), stale incremental build cache (cleared tsconfig.tsbuildinfo —
// didn't fix it), and duplicate typescript/convex package installations
// (none found). This looks like a genuine TypeScript/Convex tooling
// limitation with this project's specific `ApiFromModules` shape.
//
// Runtime behavior is verified correct regardless: `internal` is a Proxy
// (`anyApi`) that resolves `.agent_coordination.registerAgent` identically at
// runtime no matter how it's typed, and `bunx convex dev --once` successfully
// deployed and ran these exact calls. This cast only affects static analysis.
const internalUntyped = internal as any;

const SUBSYSTEM_LANES: Record<string, string[]> = {
  spine: ["auth", "mail", "api", "status"],
  forms: ["forms"],
  crm: ["crm", "help"],
  publish: ["blog", "docs"],
  design: ["designs", "sites"],
  trust: ["sign", "vault"],
};

async function doLaunchOrchestrator(ctx: ActionCtx): Promise<{ agentId: string; status: string }> {
  const agentId = `orchestrator-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "orchestrator",
    lanes: [],
    capabilities: ["heartbeat", "work_assignment", "deadlock_detection"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "heartbeat",
    message: "Orchestrator launched and registered",
  });

  return { agentId, status: "launched" };
}

export const launchOrchestrator = internalAction({
  args: {},
  handler: async (ctx) => doLaunchOrchestrator(ctx),
});

async function doLaunchPlanner(
  ctx: ActionCtx,
  context: "quarterly" | "wave",
): Promise<{ agentId: string; context: string; status: string }> {
  const agentId = `planner-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "planner",
    lanes: [],
    capabilities: ["gate_scoring", "wave_planning", "backlog_generation"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "task_start",
    message: `Planner launched for ${context} planning`,
    metadata: { context },
  });

  return { agentId, context, status: "launched" };
}

export const launchPlanner = internalAction({
  args: {
    context: v.union(v.literal("quarterly"), v.literal("wave")),
  },
  handler: async (ctx, args) => doLaunchPlanner(ctx, args.context),
});

type Subsystem = "spine" | "forms" | "crm" | "publish" | "design" | "trust";

async function doLaunchEngineer(
  ctx: ActionCtx,
  subsystem: Subsystem,
  workItemId?: string,
): Promise<{ agentId: string; subsystem: string; status: string }> {
  const agentId = `engineer-${subsystem}-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "engineer",
    lanes: SUBSYSTEM_LANES[subsystem] || [],
    capabilities: ["implementation", "testing", "schema"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "task_start",
    message: `Engineer launched for subsystem ${subsystem}`,
    metadata: workItemId ? { subsystem, workItemId } : { subsystem },
  });

  return { agentId, subsystem, status: "launched" };
}

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
    // Optional: engineers register first and get assigned work afterward by
    // the orchestrator loop (see local/orchestrator.py) — they don't need a
    // work item bound at launch time. Previously this was required, which
    // forced callers with no specific item in mind (e.g. launchAllAgents) to
    // pass a fake placeholder string cast through `as any`, bypassing the
    // v.id() validator and throwing at runtime on every real invocation.
    workItemId: v.optional(v.id("agentWorkItems")),
  },
  handler: async (ctx, args) => doLaunchEngineer(ctx, args.subsystem, args.workItemId),
});

async function doLaunchReviewer(ctx: ActionCtx): Promise<{ agentId: string; status: string }> {
  const agentId = `reviewer-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "reviewer",
    lanes: [],
    capabilities: ["code_review", "convex_patterns", "test_coverage"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "task_start",
    message: "Reviewer launched and watching for completed work",
  });

  return { agentId, status: "launched" };
}

export const launchReviewer = internalAction({
  args: {},
  handler: async (ctx) => doLaunchReviewer(ctx),
});

async function doLaunchIntegrator(
  ctx: ActionCtx,
  lane?: string,
): Promise<{ agentId: string; lane: string | undefined; status: string }> {
  const agentId = `integrator-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "integrator",
    lanes: lane ? [lane] : [],
    capabilities: ["composition_validation", "widget_api", "event_bus"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "task_start",
    message: `Integrator launched${lane ? ` for lane ${lane}` : ""}`,
    metadata: lane ? { lane } : {},
  });

  return { agentId, lane, status: "launched" };
}

export const launchIntegrator = internalAction({
  args: {
    lane: v.optional(v.string()),
  },
  handler: async (ctx, args) => doLaunchIntegrator(ctx, args.lane),
});

async function doLaunchAnalyst(
  ctx: ActionCtx,
  interval: "weekly" | "quarterly",
): Promise<{ agentId: string; interval: string; status: string }> {
  const agentId = `analyst-${Date.now()}`;

  await ctx.runMutation(internalUntyped.agent_coordination.registerAgent, {
    agentId,
    role: "analyst",
    lanes: [],
    capabilities: ["metrics_ingestion", "gate_calculation", "trend_analysis"],
    maxConcurrentTasks: 1,
  });

  await ctx.runMutation(internalUntyped.agent_coordination.logCheckpoint, {
    agent: agentId,
    checkpointType: "task_start",
    message: `Analyst launched for ${interval} analysis`,
    metadata: { interval },
  });

  return { agentId, interval, status: "launched" };
}

export const launchAnalyst = internalAction({
  args: {
    interval: v.union(v.literal("weekly"), v.literal("quarterly")),
  },
  handler: async (ctx, args) => doLaunchAnalyst(ctx, args.interval),
});

// Lives here rather than agent_bootstrap.ts, alongside its own mutations —
// see the comment in agent_bootstrap.ts for why: an action calling mutations
// defined in its own file via internal.SELF_MODULE.X creates a module-level
// circular type in the generated Convex API that per-callsite return-type
// annotations can't break, since the circularity is in resolving the whole
// module's export shape, not any one variable.
export const bootstrapSystem = action({
  args: {
    includeTestItem: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const steps: unknown[] = [];

    const registry: { initialized: boolean } = await ctx.runMutation(
      internalUntyped.agent_bootstrap.initializeAgentRegistry,
      {},
    );
    steps.push(registry);

    const work: { seeded: boolean; itemsCreated: number } = await ctx.runMutation(
      internalUntyped.agent_bootstrap.seedInitialWorkItems,
      { includeTestItem: args.includeTestItem || false },
    );
    steps.push(work);

    const benchmarks: { benchmarksCreated: number } = await ctx.runMutation(
      internalUntyped.agent_bootstrap.seedLaneMetricsBenchmarks,
      {},
    );
    steps.push(benchmarks);

    return {
      bootstrapComplete: true,
      timestamp: Date.now(),
      steps,
      summary: {
        registryInitialized: registry.initialized,
        workItemsSeeded: work.seeded ? work.itemsCreated : 0,
        benchmarksSeeded: benchmarks.benchmarksCreated,
      },
    };
  },
});

export const launchAllAgents = action({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const agents: unknown[] = [];

    agents.push(await doLaunchOrchestrator(ctx));
    agents.push(await doLaunchReviewer(ctx));
    agents.push(await doLaunchIntegrator(ctx));
    agents.push(await doLaunchAnalyst(ctx, "weekly"));

    const subsystems = ["spine", "forms", "crm", "publish", "design", "trust"] as const;
    for (const subsystem of subsystems) {
      agents.push(await doLaunchEngineer(ctx, subsystem));
    }

    agents.push(await doLaunchPlanner(ctx, "quarterly"));

    return {
      launchedAgents: agents.length,
      agents,
      timestamp: Date.now(),
    };
  },
});
