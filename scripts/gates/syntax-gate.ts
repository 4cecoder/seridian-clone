#!/usr/bin/env bun
/**
 * SyntaxGate — fast, deterministic pre-check on changed TS/TSX/JS files before
 * paying for a full `tsc --noEmit` pass. Catches the specific failure mode of
 * an agent (local or Haiku) emitting truncated or garbled code: unbalanced
 * brackets, empty files that should have content, or unterminated strings.
 *
 * This is NOT a replacement for CompilationGate (tsc) — it's a sub-second
 * sanity check that runs first so a truncated diff never even reaches the
 * expensive compiler step.
 *
 * Usage:
 *   bun run scripts/gates/syntax-gate.ts               # changed files vs origin/main
 *   bun run scripts/gates/syntax-gate.ts --base <ref>
 *   bun run scripts/gates/syntax-gate.ts --staged
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

interface SyntaxIssue {
  file: string;
  message: string;
}

const CHECKED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

const BRACKET_PAIRS: Record<string, string> = {
  "{": "}",
  "(": ")",
  "[": "]",
};
const CLOSERS = new Set(Object.values(BRACKET_PAIRS));

function getChangedFiles(baseRef: string | null, staged: boolean): string[] {
  const cmd = staged
    ? "git diff --staged --name-only --diff-filter=ACMR"
    : `git diff ${baseRef ?? "origin/main"}...HEAD --name-only --diff-filter=ACMR`;

  try {
    return execSync(cmd, { encoding: "utf-8" })
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && CHECKED_EXTENSIONS.some((ext) => f.endsWith(ext)));
  } catch {
    return [];
  }
}

/**
 * Bracket balance check that's aware of strings/template literals/comments,
 * so a `}` inside a string doesn't produce a false positive.
 */
/**
 * True if the character at `index` is escaped — i.e. preceded by an ODD
 * number of consecutive backslashes. A naive `source[index-1] === "\\"`
 * check breaks on strings like "\\" (an escaped backslash): the trailing
 * quote follows a backslash but isn't itself escaped, since that backslash
 * is already spoken for by the backslash before it.
 */
function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && source[i] === "\\") {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

// A "/" starts a regex literal (rather than being division or the start of
// a comment) when the last significant token before it can't itself be an
// operand — e.g. after `(`, `,`, `=`, `return`, `&&`, or at the very start
// of the file. This is the same heuristic real JS tokenizers use to resolve
// the classic regex-vs-division ambiguity. Without it, a regex ending in an
// escaped delimiter right before its closing delimiter (e.g. /rm\s+-rf\s+\//)
// produces a literal "//" substring that gets misread as a line comment,
// swallowing everything after it until the next newline — including real
// closing brackets — and cascading into a false "unbalanced brackets" report
// much later in the file.
const REGEX_PRECEDING_TOKEN = /(?:^|[=(,:;!&|?{}[\n]|\breturn\b|\btypeof\b|\bcase\b)\s*$/;

function looksLikeRegexStart(source: string, index: number): boolean {
  const before = source.slice(Math.max(0, index - 20), index);
  return REGEX_PRECEDING_TOKEN.test(before);
}

/**
 * Scans a regex literal starting at `source[start]` (the opening "/") and
 * returns the index just past its closing delimiter + flags, or null if it
 * runs off the end of the source unterminated. Character classes ([...])
 * can contain an unescaped "/" without ending the regex, so they're tracked
 * separately from top-level escaping.
 */
function scanRegexLiteral(source: string, start: number): number | null {
  let i = start + 1;
  let inCharClass = false;

  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") return null; // regex literals can't span lines
    if (!isEscaped(source, i)) {
      if (ch === "[") inCharClass = true;
      else if (ch === "]") inCharClass = false;
      else if (ch === "/" && !inCharClass) {
        i++;
        while (i < source.length && /[a-z]/i.test(source[i])) i++; // flags
        return i;
      }
    }
    i++;
  }
  return null;
}

function checkBalancedBrackets(source: string): string | null {
  const stack: string[] = [];
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === "*" && ch === "/") inBlockComment = false;
      continue;
    }
    if (inString) {
      if (ch === inString && !isEscaped(source, i)) inString = null;
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      inLineComment = true;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      inBlockComment = true;
      continue;
    }
    if (ch === "/" && looksLikeRegexStart(source, i)) {
      const end = scanRegexLiteral(source, i);
      if (end !== null) {
        i = end - 1; // -1 to offset the loop's i++
        continue;
      }
      // Couldn't find a closing delimiter on this line — fall through and
      // treat "/" as an ordinary character rather than guessing wrong.
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch in BRACKET_PAIRS) {
      stack.push(BRACKET_PAIRS[ch]);
    } else if (CLOSERS.has(ch)) {
      const expected = stack.pop();
      if (expected !== ch) {
        return `Unbalanced brackets: found '${ch}' but expected '${expected ?? "nothing"}'`;
      }
    }
  }

  if (inString) return `Unterminated string literal (${inString})`;
  if (inBlockComment) return "Unterminated block comment";
  if (stack.length > 0) return `Unclosed bracket(s): missing ${stack.reverse().join(", ")}`;

  return null;
}

function runSyntaxGate(files: string[]): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue; // deleted file, nothing to check

    const source = readFileSync(file, "utf-8");

    if (source.trim().length === 0) {
      issues.push({ file, message: "File is empty" });
      continue;
    }

    const bracketError = checkBalancedBrackets(source);
    if (bracketError) {
      issues.push({ file, message: bracketError });
    }
  }

  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  const baseIdx = args.indexOf("--base");
  const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : null;

  const files = getChangedFiles(baseRef, staged);
  const issues = runSyntaxGate(files);
  const passed = issues.length === 0;

  const result = {
    gateType: "syntax",
    passed,
    filesChecked: files.length,
    issues,
    timestamp: Date.now(),
  };

  console.log(JSON.stringify(result, null, 2));

  if (!passed) {
    console.error(`\n❌ SyntaxGate FAILED: ${issues.length} issue(s) in ${files.length} changed file(s).`);
    process.exit(1);
  }

  console.error(`\n✅ SyntaxGate passed — ${files.length} changed file(s) clean.`);
  process.exit(0);
}

main();
