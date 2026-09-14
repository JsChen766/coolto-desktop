import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { build } from "esbuild";

import { qaSpawnEnv, userDataDir } from "./support/coolto-desktop-session.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entry = resolve("src/cli/seed-qa-local-draft-entry.ts");
const outfile = resolve("out/cli/seed-qa-local-draft-entry.cjs");

function stopDesktopDriver() {
  spawnSync(
    process.execPath,
    ["scripts/coolto-desktop-driver.mjs", "quit"],
    { cwd: repoRoot, stdio: "inherit", env: process.env },
  );
}

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  define: { "import.meta.url": "__filename" },
});

stopDesktopDriver();
await sleep(1_500);

const require = createRequire(import.meta.url);
const electronBinary = process.env.ELECTRON_BIN ?? require("electron");
const child = spawn(
  electronBinary,
  [outfile, `--user-data-dir=${userDataDir}`],
  { cwd: repoRoot, stdio: "inherit", env: qaSpawnEnv() },
);
const [code, signal] = await new Promise((done) =>
  child.once("exit", (exitCode, exitSignal) => done([exitCode, exitSignal])),
);
if (signal) throw new Error(`Seed exited by ${signal}`);
if (code !== 0) process.exitCode = code ?? 1;
