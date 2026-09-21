#!/usr/bin/env bun
/**
 * DiffGate — scans the current diff for production secrets, destructive
 * commands, and path-traversal attempts before code is allowed to merge.
 *
 * Usage:
 *   bun run scripts/gates/diff-gate.ts                 # diff against origin/main
 *   bun run scripts/gates/diff-gate.ts --base <ref>     # diff against a specific ref
 *   bun run scripts/gates/diff-gate.ts --staged         # staged changes only
 *
 * Exits 0 if clean, 1 if any issue is found. Prints JSON findings to stdout.
 */

import { execSync } from "node:child_process";

type IssueType =
  | "production_key"
  | "destructive_command"
  | "sensitive_path"
  | "directory_traversal";

interface Issue {
  type: IssueType;
  description: string;
  location: string;
}

// Same families of production keys tests/setup.ts refuses to run against,
// extended to the literal string patterns that must never appear in a diff.
const SECRET_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /re_live_[A-Za-z0-9]+/, description: "Resend production API key" },
  { pattern: /sk_live_[A-Za-z0-9]+/, description: "Stripe production secret key" },
  { pattern: /pk_live_[A-Za-z0-9]+/, description: "Stripe production publishable key" },
  { pattern: /whsec_[A-Za-z0-9]+/, description: "Stripe webhook signing secret" },
  { pattern: /AKIA[0-9A-Z]{16}/, description: "AWS access key ID" },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, description: "Embedded private key" },
  { pattern: /ghp_[A-Za-z0-9]{36}/, description: "GitHub personal access token" },
  { pattern: /xox[baprs]-[A-Za-z0-9-]+/, description: "Slack token" },
];

const DESTRUCTIVE_COMMAND_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /rm\s+-rf\s+\//, description: "Recursive force-delete from root" },
  { pattern: /DROP\s+TABLE/i, description: "SQL DROP TABLE" },
  { pattern: /DROP\s+DATABASE/i, description: "SQL DROP DATABASE" },
  { pattern: /git\s+push\s+.*--force/, description: "Force push" },
  { pattern: /--no-verify/, description: "Bypassing git hooks" },
];

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.local|\.production)?$/,
  /(^|\/)credentials\.json$/,
  /(^|\/)\.pem$/,
  /(^|\/)id_rsa$/,
];

function getDiff(baseRef: string | null, staged: boolean): string {
  if (staged) {
    return execSync("git diff --staged --unified=0", { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  }
  const base = baseRef ?? "origin/main";
  try {
    return execSync(`git diff ${base}...HEAD --unified=0`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    // Fall back to comparing against HEAD~1 if base ref isn't available locally
    // (e.g. shallow clone without origin/main fetched).
    return execSync("git diff HEAD~1...HEAD --unified=0", {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
  }
}

function runDiffGate(diff: string): Issue[] {
  const issues: Issue[] = [];
  let currentFile = "unknown";
  let lineNumber = 0;

  for (const rawLine of diff.split("\n")) {
    const fileMatch = rawLine.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      lineNumber = 0;
      continue;
    }

    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    // Only inspect *added* lines — removing a secret should never fail the gate.
    if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;
    lineNumber += 1;
    const content = rawLine.slice(1);

    // Skip .env.example — placeholder values are expected there.
    if (/\.env\.example$/.test(currentFile)) continue;

    // docs/QUALITY_GATES.md documents these exact patterns as prose/examples
    // (e.g. "blocks `re_live_`", "catches `rm -rf /`") — matching its own
    // documentation against the patterns it describes is a false positive
    // every time, not a real finding. Narrow and specific on purpose: this
    // does NOT exempt docs/ broadly, since a real secret accidentally pasted
    // into some other doc is exactly the kind of thing DiffGate should catch.
    if (/(^|\/)docs\/QUALITY_GATES\.md$/.test(currentFile)) continue;

    // The gate scripts themselves legitimately contain these patterns as
    // regex source (e.g. the literal string "DROP TABLE" appears in this
    // very file as a pattern definition) — scanning them against their own
    // rules is a false positive every time, not a real finding.
    const isGateScript = /(^|\/)scripts\/gates\//.test(currentFile);

    for (const { pattern, description } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          type: "production_key",
          description,
          location: `${currentFile}:${lineNumber}`,
        });
      }
    }

    if (isGateScript) continue;

    for (const { pattern, description } of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          type: "destructive_command",
          description,
          location: `${currentFile}:${lineNumber}`,
        });
      }
    }

    if (content.includes("../../../")) {
      issues.push({
        type: "directory_traversal",
        description: "Suspicious deep parent-directory traversal in added content",
        location: `${currentFile}:${lineNumber}`,
      });
    }
  }

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    const fileLines = diff.split("\n").filter((l) => l.startsWith("+++ b/"));
    for (const line of fileLines) {
      const path = line.replace("+++ b/", "").trim();
      if (pattern.test(path)) {
        issues.push({
          type: "sensitive_path",
          description: `Diff modifies a sensitive file: ${path}`,
          location: path,
        });
      }
    }
  }

  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  const baseIdx = args.indexOf("--base");
  const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : null;

  let diff: string;
  try {
    diff = getDiff(baseRef, staged);
  } catch (err) {
    console.error("❌ DiffGate: failed to compute diff —", (err as Error).message);
    process.exit(1);
  }

  const issues = runDiffGate(diff);
  const passed = issues.length === 0;

  const result = {
    gateType: "diff",
    passed,
    issues,
    timestamp: Date.now(),
  };

  console.log(JSON.stringify(result, null, 2));

  if (!passed) {
    console.error(`\n❌ DiffGate FAILED: ${issues.length} issue(s) found.`);
    process.exit(1);
  }

  console.error("\n✅ DiffGate passed — no production keys, destructive commands, or unsafe paths in diff.");
  process.exit(0);
}

main();
