/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("agent-coordination", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest({ schema, modules });
  });

  describe("createWorkItem / getPendingWork", () => {
    test("creates a work item and finds it as pending", async () => {
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Add TOTP support",
        priority: "high",
      });

      const pending = await t.query(api.agent_coordination.getPendingWork, {});
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ title: "Add TOTP support", lane: "Auth", status: "pending" });
    });

    test("filters pending work by lane using the by_status_and_lane index", async () => {
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Auth work",
        priority: "high",
      });
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Forms",
        title: "Forms work",
        priority: "medium",
      });

      const authOnly = await t.query(api.agent_coordination.getPendingWork, { lane: "Auth" });
      expect(authOnly).toHaveLength(1);
      expect(authOnly[0].title).toBe("Auth work");

      const formsOnly = await t.query(api.agent_coordination.getPendingWork, { lane: "Forms" });
      expect(formsOnly).toHaveLength(1);
      expect(formsOnly[0].title).toBe("Forms work");

      // No lane filter -> both come back via the by_status index path.
      const all = await t.query(api.agent_coordination.getPendingWork, {});
      expect(all).toHaveLength(2);
    });

    test("does not return claimed items as pending", async () => {
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Claim me",
        priority: "high",
      });
      await t.mutation(api.agent_coordination.claimWorkItem, { workItemId: itemId, agentId: "engineer-auth-001" });

      const pending = await t.query(api.agent_coordination.getPendingWork, {});
      expect(pending).toHaveLength(0);
    });

    test("respects the limit argument", async () => {
      for (let i = 0; i < 5; i++) {
        await t.mutation(api.agent_coordination.createWorkItem, {
          workType: "implementation",
          lane: "Auth",
          title: `Item ${i}`,
          priority: "medium",
        });
      }
      const limited = await t.query(api.agent_coordination.getPendingWork, { limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe("claimWorkItem", () => {
    test("claims a pending item", async () => {
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Claim me",
        priority: "high",
      });

      const result = await t.mutation(api.agent_coordination.claimWorkItem, {
        workItemId: itemId,
        agentId: "engineer-auth-001",
      });
      expect(result.itemId).toBe(itemId);

      const status = await t.query(api.agent_coordination.getWorkStatus, {});
      expect(status.byStatus.claimed).toBe(1);
      expect(status.byStatus.pending).toBe(0);
    });

    test("throws when claiming an already-claimed item — no double-claim race", async () => {
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Contested item",
        priority: "high",
      });

      await t.mutation(api.agent_coordination.claimWorkItem, { workItemId: itemId, agentId: "engineer-auth-001" });

      await expect(
        t.mutation(api.agent_coordination.claimWorkItem, { workItemId: itemId, agentId: "engineer-auth-002" }),
      ).rejects.toThrow("Work item not available");
    });

    test("throws for a non-existent work item", async () => {
      // Create then delete a real item to get a validly-typed but dangling Id.
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "temp",
        priority: "low",
      });
      await t.run(async (ctx) => {
        await ctx.db.delete(itemId);
      });

      await expect(
        t.mutation(api.agent_coordination.claimWorkItem, { workItemId: itemId, agentId: "engineer-auth-001" }),
      ).rejects.toThrow("Work item not found");
    });
  });

  describe("updateWorkItemProgress", () => {
    test("marks an item completed with a result", async () => {
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Finish me",
        priority: "high",
      });
      await t.mutation(api.agent_coordination.claimWorkItem, { workItemId: itemId, agentId: "engineer-auth-001" });

      await t.mutation(api.agent_coordination.updateWorkItemProgress, {
        workItemId: itemId,
        status: "completed",
        result: { summary: "Shipped TOTP" },
      });

      const status = await t.query(api.agent_coordination.getWorkStatus, {});
      expect(status.byStatus.completed).toBe(1);
    });
  });

  describe("getWorkItemDependencies", () => {
    test("returns dependency items with their status", async () => {
      const { itemId: dep1 } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Spine",
        title: "Base schema",
        priority: "critical",
      });
      const { itemId: main } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "Depends on schema",
        priority: "high",
        dependencies: [dep1],
      });

      const deps = await t.query(api.agent_coordination.getWorkItemDependencies, { workItemId: main });
      expect(deps).not.toBeNull();
      expect(deps!.dependencies).toHaveLength(1);
      expect(deps!.dependencies[0]).toMatchObject({ title: "Base schema", status: "pending" });
    });

    test("returns null for a non-existent item", async () => {
      const { itemId } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "temp",
        priority: "low",
      });
      await t.run(async (ctx) => {
        await ctx.db.delete(itemId);
      });

      const deps = await t.query(api.agent_coordination.getWorkItemDependencies, { workItemId: itemId });
      expect(deps).toBeNull();
    });
  });

  describe("logCheckpoint / getAgentHeartbeats", () => {
    test("logs a checkpoint and retrieves it filtered by agent", async () => {
      await t.mutation(api.agent_coordination.logCheckpoint, {
        agent: "engineer-auth-001",
        checkpointType: "task_start",
        message: "Starting TOTP implementation",
      });
      await t.mutation(api.agent_coordination.logCheckpoint, {
        agent: "engineer-forms-001",
        checkpointType: "task_start",
        message: "Starting form validation",
      });

      const authCheckpoints = await t.query(api.agent_coordination.getAgentHeartbeats, { agent: "engineer-auth-001" });
      expect(authCheckpoints).toHaveLength(1);
      expect(authCheckpoints[0].message).toBe("Starting TOTP implementation");
    });

    test("returns all checkpoints newest-first when no agent filter is given", async () => {
      await t.mutation(api.agent_coordination.logCheckpoint, {
        agent: "engineer-auth-001",
        checkpointType: "task_start",
        message: "first",
      });
      await t.mutation(api.agent_coordination.logCheckpoint, {
        agent: "engineer-forms-001",
        checkpointType: "task_start",
        message: "second",
      });

      const all = await t.query(api.agent_coordination.getAgentHeartbeats, {});
      expect(all).toHaveLength(2);
      // by_timestamp + order("desc") — most recent (second) should be first.
      expect(all[0].message).toBe("second");
    });

    test("respects the limit argument", async () => {
      for (let i = 0; i < 5; i++) {
        await t.mutation(api.agent_coordination.logCheckpoint, {
          agent: "engineer-auth-001",
          checkpointType: "heartbeat",
          message: `beat ${i}`,
        });
      }
      const limited = await t.query(api.agent_coordination.getAgentHeartbeats, { limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe("recordLaneMetric / getLaneMetrics", () => {
    test("records and retrieves a metric within the time window", async () => {
      await t.mutation(api.agent_coordination.recordLaneMetric, {
        lane: "Auth",
        metric: "coverage",
        value: 92,
      });

      const metrics = await t.query(api.agent_coordination.getLaneMetrics, { lane: "Auth" });
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({ lane: "Auth", metric: "coverage", value: 92 });
    });

    test("filters by metric name when given", async () => {
      await t.mutation(api.agent_coordination.recordLaneMetric, { lane: "Auth", metric: "coverage", value: 92 });
      await t.mutation(api.agent_coordination.recordLaneMetric, { lane: "Auth", metric: "latency_ms", value: 40 });

      const coverageOnly = await t.query(api.agent_coordination.getLaneMetrics, { lane: "Auth", metric: "coverage" });
      expect(coverageOnly).toHaveLength(1);
      expect(coverageOnly[0].metric).toBe("coverage");
    });
  });

  describe("registerAgent / getAgentConfig / getAgentsByRole", () => {
    test("registers a new agent", async () => {
      const result = await t.mutation(api.agent_coordination.registerAgent, {
        agentId: "engineer-auth-001",
        role: "engineer",
        lanes: ["Auth"],
        capabilities: ["typescript", "convex"],
        maxConcurrentTasks: 2,
      });
      expect(result).toMatchObject({ agentId: "engineer-auth-001", registered: true });

      const config = await t.query(api.agent_coordination.getAgentConfig, { agentId: "engineer-auth-001" });
      expect(config).toMatchObject({ role: "engineer", lanes: ["Auth"], active: true });
    });

    test("re-registering the same agent updates rather than duplicates", async () => {
      await t.mutation(api.agent_coordination.registerAgent, {
        agentId: "engineer-auth-001",
        role: "engineer",
        lanes: ["Auth"],
        capabilities: ["typescript"],
        maxConcurrentTasks: 2,
      });
      const second = await t.mutation(api.agent_coordination.registerAgent, {
        agentId: "engineer-auth-001",
        role: "engineer",
        lanes: ["Auth", "Mail"],
        capabilities: ["typescript", "resend"],
        maxConcurrentTasks: 3,
      });
      expect(second).toMatchObject({ registered: true, updated: true });

      const config = await t.query(api.agent_coordination.getAgentConfig, { agentId: "engineer-auth-001" });
      expect(config?.lanes).toEqual(["Auth", "Mail"]);
      expect(config?.maxConcurrentTasks).toBe(3);
    });

    test("getAgentsByRole returns only active agents of that role", async () => {
      await t.mutation(api.agent_coordination.registerAgent, {
        agentId: "engineer-auth-001",
        role: "engineer",
        lanes: ["Auth"],
        capabilities: [],
        maxConcurrentTasks: 2,
      });
      await t.mutation(api.agent_coordination.registerAgent, {
        agentId: "reviewer-primary",
        role: "reviewer",
        lanes: [],
        capabilities: [],
        maxConcurrentTasks: 1,
      });

      const engineers = await t.query(api.agent_coordination.getAgentsByRole, { role: "engineer" });
      expect(engineers).toHaveLength(1);
      expect(engineers[0].agentId).toBe("engineer-auth-001");
    });
  });

  describe("getWorkStatus", () => {
    test("aggregates counts by status across all lanes", async () => {
      const { itemId: a } = await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "A",
        priority: "high",
      });
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Forms",
        title: "B",
        priority: "medium",
      });
      await t.mutation(api.agent_coordination.claimWorkItem, { workItemId: a, agentId: "engineer-auth-001" });

      const status = await t.query(api.agent_coordination.getWorkStatus, {});
      expect(status.byStatus.claimed).toBe(1);
      expect(status.byStatus.pending).toBe(1);
    });

    test("filters by lane using the by_lane index", async () => {
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Auth",
        title: "A",
        priority: "high",
      });
      await t.mutation(api.agent_coordination.createWorkItem, {
        workType: "implementation",
        lane: "Forms",
        title: "B",
        priority: "medium",
      });

      const authStatus = await t.query(api.agent_coordination.getWorkStatus, { lane: "Auth" });
      expect(authStatus.byStatus.pending).toBe(1);
    });
  });
});
