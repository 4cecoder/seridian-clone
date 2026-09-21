#!/usr/bin/env bun
/// <reference path="./seridian.d.ts" />
/**
 * seridian — single CLI entry point for the SWE gauntlet: quality gates,
 * local (MLX) orchestration, agent bootstrap, work seeding, and context
 * retrieval. Every subcommand here wraps a piece that has been individually
 * verified to work (see docs/LOCAL_MODEL_GUIDE.md, docs/QUALITY_GATES.md) —
 * this is glue, not new untested logic.
 *
 * Usage: bun run seridian <command> [...args]
 * Run `bun run seridian help` for the full command list.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIR = join(REPO_ROOT, "local");
const SERIDIAN_HOME = join(homedir(), ".seridian");
const VENV_PYTHON = join(SERIDIAN_HOME, "venv", "bin", "python3");
const MEMORY_DB = join(SERIDIAN_HOME, "memory.db");
const LOGS_DIR = join(SERIDIAN_HOME, "logs");
const PIDS_FILE = join(SERIDIAN_HOME, "pids.json");
const MLX_MODEL = process.env.SERIDIAN_LOCAL_MODEL ?? "mlx-community/Qwen2.5-1.5B-Instruct-4bit";
const MLX_PORT = process.env.SERIDIAN_MLX_PORT ?? "8080";
const MLX_URL = `http://localhost:${MLX_PORT}`;

function color(code: number, text: string): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (s: string) => color(32, s);
const red = (s: string) => color(31, s);
const yellow = (s: string) => color(33, s);
const dim = (s: string) => color(2, s);

function hasPython(): boolean {
  return existsSync(VENV_PYTHON);
}

function requirePython() {
  if (!hasPython()) {
    console.error(red("✗ No local Python venv found at ~/.seridian/venv"));
    console.error(dim("  Set it up with: uv venv ~/.seridian/venv --python 3.12 && uv pip install --python ~/.seridian/venv/bin/python3 mlx-lm requests"));
    process.exit(1);
  }
}

function runPython(script: string, args: string[] = []): void {
  requirePython();
  // spawnSync with an argv array — never shell-interpolated, so arbitrary
  // arguments (queries, titles) can't break quoting or get shell-expanded.
  const result = spawnSync(VENV_PYTHON, [script, ...args], { cwd: LOCAL_DIR, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function checkMlxHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MLX_URL}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── gates ──────────────────────────────────────────────────────────────

function cmdGates(args: string[]) {
  const result = spawnSync("bun", ["run", "scripts/gates/run-gates.ts", ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ── test ───────────────────────────────────────────────────────────────

function cmdTest(e2e: boolean) {
  const result = spawnSync("bun", ["run", e2e ? "test:e2e" : "test"], { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ── status ─────────────────────────────────────────────────────────────

async function cmdStatus() {
  console.log(color(1, "\nSeridian Gauntlet — Status\n"));

  // Git
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: REPO_ROOT }).toString().trim().split("\n").filter(Boolean).length;
    console.log(`${dim("git")}         branch ${branch}, ${dirty} uncommitted change(s)`);
  } catch {
    console.log(`${dim("git")}         ${yellow("not a git repo or git unavailable")}`);
  }

  // MLX server
  const mlxUp = await checkMlxHealth();
  console.log(`${dim("mlx server")}  ${mlxUp ? green(`up (${MLX_URL})`) : red("down")}${mlxUp ? "" : dim(" — start with: bun run seridian local up")}`);

  // Local memory DB
  if (existsSync(MEMORY_DB)) {
    try {
      const db = new Database(MEMORY_DB, { readonly: true });
      const agents = db.query("SELECT COUNT(*) as c FROM agents").get() as { c: number };
      const pending = db.query("SELECT COUNT(*) as c FROM work_items WHERE status='pending'").get() as { c: number };
      const claimed = db.query("SELECT COUNT(*) as c FROM work_items WHERE status='claimed'").get() as { c: number };
      const checkpoints = db.query("SELECT COUNT(*) as c FROM checkpoints").get() as { c: number };
      db.close();
      console.log(`${dim("local memory")} ${agents.c} agent(s), ${pending.c} pending / ${claimed.c} claimed work item(s), ${checkpoints.c} checkpoint(s)`);
    } catch (err) {
      console.log(`${dim("local memory")} ${red("error reading DB: " + (err as Error).message)}`);
    }
  } else {
    console.log(`${dim("local memory")} ${yellow("not initialized")}${dim(" — run: bun run seridian bootstrap")}`);
  }

  // Orchestrator process
  if (existsSync(PIDS_FILE)) {
    const pids = JSON.parse(readFileSync(PIDS_FILE, "utf-8"));
    for (const [name, pid] of Object.entries(pids)) {
      const alive = isPidAlive(pid as number);
      console.log(`${dim(name)}  ${alive ? green(`running (pid ${pid})`) : red("not running (stale pid)")}`);
    }
  } else {
    console.log(`${dim("orchestrator")} ${yellow("not running")}${dim(" — start with: bun run seridian local up")}`);
  }

  console.log("");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── local up/down/logs ─────────────────────────────────────────────────

function readPids(): Record<string, number> {
  if (!existsSync(PIDS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(PIDS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writePids(pids: Record<string, number>) {
  writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2));
}

async function cmdLocalUp() {
  requirePython();
  mkdirSync(LOGS_DIR, { recursive: true });

  const pids = readPids();
  if (pids.mlx_server && isPidAlive(pids.mlx_server)) {
    console.log(yellow("MLX server already running (pid " + pids.mlx_server + ")"));
  } else {
    console.log(dim(`Starting MLX server (${MLX_MODEL}) on port ${MLX_PORT}...`));
    const mlxLog = join(LOGS_DIR, "mlx-server.log");
    const mlxLogFd = openSync(mlxLog, "a");
    const mlxProc = spawn(
      VENV_PYTHON,
      ["-m", "mlx_lm.server", "--model", MLX_MODEL, "--port", MLX_PORT],
      {
        cwd: SERIDIAN_HOME,
        detached: true,
        stdio: ["ignore", mlxLogFd, mlxLogFd],
      },
    );
    mlxProc.unref();
    pids.mlx_server = mlxProc.pid!;
    writePids(pids);

    // Wait for health check, up to ~15s (first run may need to download the model).
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkMlxHealth()) {
        healthy = true;
        break;
      }
    }
    console.log(healthy ? green("✓ MLX server healthy") : yellow("⚠ MLX server not responding yet — check " + mlxLog));
  }

  if (pids.orchestrator && isPidAlive(pids.orchestrator)) {
    console.log(yellow("Orchestrator already running (pid " + pids.orchestrator + ")"));
  } else {
    console.log(dim("Starting orchestrator loop (10s interval)..."));
    const orchLog = join(LOGS_DIR, "orchestrator.log");
    const orchLogFd = openSync(orchLog, "a");
    const orchProc = spawn(VENV_PYTHON, ["orchestrator.py", "--loop", "10"], {
      cwd: LOCAL_DIR,
      env: { ...process.env, SERIDIAN_LOCAL_LLM_URL: `${MLX_URL}/v1/chat/completions`, SERIDIAN_LOCAL_MODEL: MLX_MODEL },
      detached: true,
      stdio: ["ignore", orchLogFd, orchLogFd],
    });
    orchProc.unref();
    pids.orchestrator = orchProc.pid!;
    writePids(pids);
    console.log(green("✓ Orchestrator started") + dim(` (pid ${orchProc.pid}, log: ${orchLog})`));
  }
}

function cmdLocalDown() {
  const pids = readPids();
  let stopped = 0;
  for (const [name, pid] of Object.entries(pids)) {
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(green(`✓ Stopped ${name} (pid ${pid})`));
        stopped++;
      } catch (err) {
        console.log(red(`✗ Failed to stop ${name} (pid ${pid}): ${(err as Error).message}`));
      }
    }
  }
  if (existsSync(PIDS_FILE)) rmSync(PIDS_FILE);
  if (stopped === 0) console.log(dim("Nothing was running."));
}

function cmdLocalLogs(follow: boolean) {
  const mlxLog = join(LOGS_DIR, "mlx-server.log");
  const orchLog = join(LOGS_DIR, "orchestrator.log");
  const args = follow ? ["-f"] : ["-n", "40"];
  execSync(`tail ${args.join(" ")} ${mlxLog} ${orchLog}`, { stdio: "inherit" });
}

// ── bootstrap / seed / context ─────────────────────────────────────────

function cmdBootstrap() {
  runPython("bootstrap.py");
}

function cmdSeed(title: string, lane: string, priority: string) {
  requirePython();
  const id = `wi_${Date.now()}`;
  const py = `
from memory import LocalMemory
mem = LocalMemory()
mem.add_work_item({
    "id": ${JSON.stringify(id)},
    "lane": ${JSON.stringify(lane)},
    "title": ${JSON.stringify(title)},
    "status": "pending",
    "priority": ${JSON.stringify(priority)},
})
mem.close()
print("Seeded work item:", ${JSON.stringify(id)})
`;
  // Passed as a single argv element (no shell), so the real newlines in `py`
  // reach python -c intact instead of being shell-escaped as literal "\n".
  const result = spawnSync(VENV_PYTHON, ["-c", py], { cwd: LOCAL_DIR, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function cmdContext(query: string) {
  runPython("context.py", [query]);
}

// ── help / dispatch ────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${color(1, "seridian")} — SWE gauntlet CLI

${color(1, "Quality")}
  gates [--staged|--base <ref>]   Run SyntaxGate + DiffGate + CompilationGate
  test                            Run unit tests (vitest)
  test:e2e                        Run E2E tests (playwright)

${color(1, "Local orchestration (Apple Silicon MLX)")}
  local up                        Start MLX server + orchestrator loop
  local down                      Stop both
  local logs [-f]                 Show (or follow) their logs
  status                          Show git / MLX / local memory / orchestrator status

${color(1, "Agents & work")}
  bootstrap                       Register the 10 core agents in local memory
  seed "<title>" [lane] [priority]  Add a pending work item to local memory

${color(1, "Context")}
  context "<query>"               Retrieve + compress relevant docs/memory for a query

${dim("Run: bun run seridian <command>")}
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "gates":
      cmdGates(rest);
      break;
    case "test":
      cmdTest(false);
      break;
    case "test:e2e":
      cmdTest(true);
      break;
    case "status":
      await cmdStatus();
      break;
    case "local": {
      const sub = rest[0];
      if (sub === "up") await cmdLocalUp();
      else if (sub === "down") cmdLocalDown();
      else if (sub === "logs") cmdLocalLogs(rest.includes("-f"));
      else {
        console.error(red(`Unknown 'local' subcommand: ${sub}`));
        printHelp();
        process.exit(1);
      }
      break;
    }
    case "bootstrap":
      cmdBootstrap();
      break;
    case "seed": {
      const title = rest[0];
      if (!title) {
        console.error(red("Usage: seridian seed \"<title>\" [lane] [priority]"));
        process.exit(1);
      }
      cmdSeed(title, rest[1] ?? "general", rest[2] ?? "medium");
      break;
    }
    case "context": {
      const query = rest.join(" ");
      if (!query) {
        console.error(red('Usage: seridian context "<query>"'));
        process.exit(1);
      }
      cmdContext(query);
      break;
    }
    case "help":
    case undefined:
      printHelp();
      break;
    default:
      console.error(red(`Unknown command: ${cmd}`));
      printHelp();
      process.exit(1);
  }
}

main();
