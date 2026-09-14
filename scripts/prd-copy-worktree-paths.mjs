#!/usr/bin/env node
/**
 * Copy files between two worktrees (serial merge helper). Does not run git add/commit.
 *
 * --from <abs worktree>
 * --to <abs worktree>   (optional with --write-manifest or --inventory-only)
 * --prefix <path/>   (repeatable; copy all dirty+untracked paths under prefix from --from status)
 * --manifest <json>  optional: { "paths": ["rel/path", ...] } or string array
 * --write-manifest <json>  write path list from --from porcelain (no copy)
 * --inventory-only   print path count; exit 1 (use --write-manifest to persist)
 * --dry-run
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";

const gitBin = process.platform === "win32" ? "git.exe" : "git";

function parseArgs(argv) {
  const opts = {
    from: "",
    to: "",
    prefixes: [],
    manifest: "",
    writeManifest: "",
    inventoryOnly: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") opts.from = normalize(argv[++i]);
    else if (a === "--to") opts.to = normalize(argv[++i]);
    else if (a === "--prefix") opts.prefixes.push(argv[++i].replace(/\\/g, "/"));
    else if (a === "--manifest") opts.manifest = argv[++i];
    else if (a === "--write-manifest") opts.writeManifest = argv[++i];
    else if (a === "--inventory-only") opts.inventoryOnly = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!opts.from) throw new Error("--from is required");
  if (opts.writeManifest || opts.inventoryOnly) {
    if (!opts.from) throw new Error("--from is required");
  } else if (!opts.to) {
    throw new Error("--to is required unless --write-manifest or --inventory-only");
  }
  if (
    !opts.writeManifest &&
    !opts.inventoryOnly &&
    !opts.manifest &&
    opts.prefixes.length === 0
  ) {
    throw new Error("Provide --manifest or at least one --prefix");
  }
  return opts;
}

function pathsFromSource(opts) {
  if (opts.manifest) return loadManifest(opts.manifest);
  const status = gitStatusPaths(opts.from);
  if (opts.prefixes.length) return selectPaths(status, opts.prefixes);
  if (opts.writeManifest || opts.inventoryOnly) return status;
  throw new Error("Provide --manifest or at least one --prefix");
}

function gitStatusPaths(repo) {
  const out = execFileSync(gitBin, ["status", "--porcelain=v1", "-uall"], {
    cwd: repo,
    encoding: "utf8",
  });
  const paths = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let rel = line.slice(3).trim();
    if (rel.includes(" -> ")) rel = rel.split(" -> ")[1];
    paths.push(rel.replace(/\\/g, "/"));
  }
  return paths;
}

function loadManifest(manifestPath) {
  const data = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (Array.isArray(data)) {
    return data.map((p) =>
      typeof p === "string" ? p.replace(/\\/g, "/") : String(p.path).replace(/\\/g, "/"),
    );
  }
  if (Array.isArray(data.paths)) {
    return data.paths.map((p) =>
      typeof p === "string" ? p.replace(/\\/g, "/") : String(p.path).replace(/\\/g, "/"),
    );
  }
  throw new Error("Manifest must be array or { paths: [] }");
}

function selectPaths(allPaths, prefixes) {
  if (prefixes.length === 0) return allPaths;
  return allPaths.filter((p) => prefixes.some((pre) => p === pre || p.startsWith(pre)));
}

const opts = parseArgs(process.argv);
let relPaths = [...new Set(pathsFromSource(opts))].sort();

if (opts.inventoryOnly) {
  console.log(`inventory: ${relPaths.length} path(s) under --from`);
  console.log("Persist with: --write-manifest <json>");
  process.exit(1);
}

if (opts.writeManifest) {
  const payload = {
    generatedAt: new Date().toISOString(),
    from: opts.from,
    pathCount: relPaths.length,
    paths: relPaths,
  };
  writeFileSync(opts.writeManifest, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${relPaths.length} paths to ${opts.writeManifest}`);
  process.exit(0);
}

let copied = 0;
let skipped = 0;
for (const rel of relPaths) {
  const src = join(opts.from, rel);
  const dest = join(opts.to, rel);
  if (!existsSync(src)) {
    console.warn(`skip missing source: ${rel}`);
    skipped += 1;
    continue;
  }
  if (opts.dryRun) {
    console.log(`would copy: ${rel}`);
    copied += 1;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied: ${rel}`);
  copied += 1;
}

console.log(
  `\n${opts.dryRun ? "Would copy" : "Copied"} ${copied} path(s); skipped ${skipped}.`,
);
console.log(`Next: cd "${opts.to}" && npm run check`);
