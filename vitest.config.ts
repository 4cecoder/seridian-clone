import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Playwright E2E specs live here too — never collect them as unit tests.
    // .claude/worktrees/** holds full nested checkouts used by isolated
    // subagent work (see Agent tool `isolation: "worktree"`) — without this,
    // vitest recurses into them and runs a second, separate copy of the
    // entire suite alongside this repo's, inflating pass counts and mixing
    // two different codebases' results into one report.
    exclude: ["tests/e2e/**", "node_modules", ".claude/worktrees/**"],
  },
});
