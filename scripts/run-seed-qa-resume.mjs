import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { defaultDotEnvPath, qaSpawnEnv, userDataDir } from "./support/coolto-desktop-session.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entry = resolve("src/cli/seed-qa-resume-entry.ts");
const outfile = resolve("out/cli/seed-qa-resume-entry.cjs");

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
else console.log(`dotenv=${defaultDotEnvPath}`);
