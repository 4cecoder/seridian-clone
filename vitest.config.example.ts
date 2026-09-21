import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Edge runtime for Convex functions (instead of Node.js)
    environment: "edge-runtime",

    // Global test setup - sets environment variables safely
    setupFiles: ["./tests/setup.ts"],

    // Coverage targets per TEST_STRATEGY.md
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "convex/_generated/",
      ],
      // Per-lane targets from TEST_STRATEGY.md
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Don't run E2E tests in unit test suite
    exclude: ["**/__e2e__/**", "tests/e2e/**"],

    // Reasonable timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Globals: describe, it, expect without imports
    globals: true,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
