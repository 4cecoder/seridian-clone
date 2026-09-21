#!/usr/bin/env bun
/**
 * Runs the deterministic quality gate suite in order, cheapest-first, so a
 * bad diff fails fast before paying for a full TypeScript compile:
 *
 *   1. SyntaxGate       — bracket/string balance on changed files (~10ms)
 *   2. DiffGate         — production keys, destructive commands (~50ms)
 *   3. CompilationGate  — `tsc --noEmit` (~seconds)
 *
 * CoverageGate and ObjectiveGate are intentionally NOT run here yet — they
 * need per-lane thresholds (docs/TEST_STRATEGY.md) and task-specific
 * objectives respectively, and aren't purely mechanical the way these three
 * are. See docs/QUALITY_GATES.md for the full 6-gate design.
 *
 * Usage:
 *   bun run gates                  # diff against origin/main
 *   bun run gates -- --base <ref>
 *   bun run gates -- --staged
 */

import { execSync } from "node:child_process";

function runGate(name: string, command: string): boolean {
  console.error(`\n─── ${name} ───`);
  try {
    execSync(command, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const passthroughArgs = process.argv.slice(2).join(" ");

  const results: { name: string; passed: boolean }[] = [];

  results.push({
    name: "SyntaxGate",
    passed: runGate("SyntaxGate", `bun run scripts/gates/syntax-gate.ts ${passthroughArgs}`),
  });

  results.push({
    name: "DiffGate",
    passed: runGate("DiffGate", `bun run scripts/gates/diff-gate.ts ${passthroughArgs}`),
  });

  results.push({
    name: "CompilationGate",
    passed: runGate("CompilationGate", "bunx tsc --noEmit"),
  });

  console.error("\n─── Quality Gate Summary ───");
  for (const { name, passed } of results) {
    console.error(`  ${passed ? "✅" : "❌"} ${name}`);
  }

  const allPassed = results.every((r) => r.passed);

  if (!allPassed) {
    console.error("\n❌ Quality gates FAILED. Fix the issues above before merging.");
    process.exit(1);
  }

  console.error("\n✅ All quality gates passed.");
  process.exit(0);
}

main();
