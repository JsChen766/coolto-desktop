#!/usr/bin/env node
/**
 * List cv-agent-app linked worktrees with dirty path counts.
 * Usage: node scripts/prd-worktree-inventory.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Maintainer-only map. Override with COOLTO_LOCAL_ROOT; never commit a real machine path.
const localRoot = process.env.COOLTO_LOCAL_ROOT
  ? path.resolve(process.env.COOLTO_LOCAL_ROOT)
  : path.resolve(repoRoot, "..");
const gitBin = process.platform === "win32" ? "git.exe" : "git";

function run(gitDir, args) {
  return execFileSync(gitBin, args, {
    cwd: gitDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();
}

function parseWorktrees() {
  const raw = run(repoRoot, ["worktree", "list", "--porcelain"]);
  const entries = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length), branch: "", head: "" };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function countDirty(wtPath) {
  if (!existsSync(wtPath) || !existsSync(path.join(wtPath, ".git"))) return null;
  try {
    run(wtPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return null;
  }
  const out = run(wtPath, ["status", "--porcelain=v1", "-uall"]);
  if (!out) return { total: 0, modified: 0, untracked: 0 };
  const lines = out.split("\n").filter(Boolean);
  let modified = 0;
  let untracked = 0;
  for (const line of lines) {
    if (line.startsWith("??")) untracked += 1;
    else modified += 1;
  }
  return { total: lines.length, modified, untracked };
}

const ROLE = {
  [path.normalize(path.join(localRoot, "cv-agent-app"))]: "USER primary (do not use for PRD line)",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-privacy"))]:
    "INTEGRATION TRUNK — Phase 4 merged (480 paths)",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-app-closure"))]:
    "Phase 4 closure — read-only reference",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-material-product-takeover"))]:
    "Phase 1 MAT — read-only reference",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-profile-pref-app-takeover"))]:
    "Phase 2 PRO/PREF — read-only reference",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-material-product"))]:
    "retire — use *-takeover",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-profile-pref-app"))]:
    "retire — reconcile 7 paths first",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-admin-analytics-handback-be"))]:
    "Backend D1 — active writer",
  [path.normalize(path.join(localRoot, ".codex-worktrees/prd-backend-shared-integration"))]:
    "Backend ACCEPT reference (read-only)",
};

const entries = parseWorktrees();

const worktreesRoot = path.resolve(repoRoot, "../.codex-worktrees");
const extraDirs = [];
if (existsSync(worktreesRoot)) {
  for (const name of readdirSync(worktreesRoot)) {
    const full = path.join(worktreesRoot, name);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (name.endsWith(".git")) continue;
    if (!existsSync(path.join(full, ".git"))) continue;
    if (entries.some((e) => path.normalize(e.path) === path.normalize(full))) continue;
    let branch = "";
    let head = "";
    try {
      branch = run(full, ["rev-parse", "--abbrev-ref", "HEAD"]);
      head = run(full, ["rev-parse", "--short", "HEAD"]);
    } catch {
      continue;
    }
    extraDirs.push({ path: full, branch: `refs/heads/${branch}`, head });
  }
}

const allEntries = [...entries, ...extraDirs].sort((a, b) =>
  a.path.localeCompare(b.path),
);

console.log("cv-agent-app worktrees\n");
console.log(
  "role".padEnd(42) +
    "branch".padEnd(36) +
    "dirty".padStart(6) +
    "  path",
);
console.log("-".repeat(110));

for (const e of allEntries) {
  const norm = path.normalize(e.path);
  const counts = countDirty(norm);
  const role = ROLE[norm] ?? "historical / evidence";
  const branch = e.branch.replace(/^refs\/heads\//, "") || "(detached)";
  const dirty = counts ? String(counts.total) : "n/a";
  console.log(
    role.padEnd(42) + branch.padEnd(36) + dirty.padStart(6) + "  " + norm,
  );
}

console.log("\nSee .cursor-pm/WORKTREES.md for serial merge order.");
