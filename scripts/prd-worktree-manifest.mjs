#!/usr/bin/env node
/**
 * Write a reproducibility manifest for a worktree: porcelain paths + SHA-256.
 * Usage: node scripts/prd-worktree-manifest.mjs --repo <abs> --out <manifest.json>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";

const gitBin = process.platform === "win32" ? "git.exe" : "git";

function parseArgs(argv) {
  let repo = "";
  let out = "";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--repo") repo = normalize(argv[++i]);
    else if (argv[i] === "--out") out = argv[++i];
    else throw new Error(`Unknown arg: ${argv[i]}`);
  }
  if (!repo || !out) throw new Error("--repo and --out required");
  return { repo, out };
}

function porcelainPaths(repo) {
  const raw = execFileSync(gitBin, ["status", "--porcelain=v1", "-uall"], {
    cwd: repo,
    encoding: "utf8",
  });
  const paths = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let rel = line.slice(3).trim().replace(/\\/g, "/");
    if (rel.includes(" -> ")) rel = rel.split(" -> ")[1].trim();
    paths.push(rel);
  }
  return [...new Set(paths)].sort();
}

function sha256File(abs) {
  const buf = readFileSync(abs);
  return createHash("sha256").update(buf).digest("hex");
}

const { repo, out } = parseArgs(process.argv);
const paths = porcelainPaths(repo);
const entries = [];
for (const rel of paths) {
  const abs = join(repo, rel);
  try {
    entries.push({ path: rel, sha256: sha256File(abs) });
  } catch {
    entries.push({ path: rel, sha256: null, missing: true });
  }
}
const statusRaw = execFileSync(gitBin, ["status", "--porcelain=v1", "-uall"], {
  cwd: repo,
  encoding: "utf8",
});
const statusDigest = createHash("sha256").update(statusRaw, "utf8").digest("hex");
const payload = {
  generatedAt: new Date().toISOString(),
  repo,
  head: execFileSync(gitBin, ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  branch: execFileSync(gitBin, ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  pathCount: entries.length,
  statusPorcelainSha256: statusDigest,
  paths: entries,
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${entries.length} paths to ${out}`);
console.log(`statusPorcelainSha256=${statusDigest}`);
