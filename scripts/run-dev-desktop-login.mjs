import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { qaSpawnEnv } from "./support/coolto-desktop-session.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultUserDataDir = join(repoRoot, "local-qa-data", "desktop-driver", "user-data");

const entry = resolve("src/cli/dev-desktop-login-entry.ts");
const outfile = resolve("out/cli/dev-desktop-login-entry.cjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
});

const require = createRequire(import.meta.url);
const electronBinary = process.env.ELECTRON_BIN ?? require("electron");
const userDataDir = resolve(defaultUserDataDir);
const child = spawn(
  electronBinary,
  [`--user-data-dir=${userDataDir}`, outfile],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: qaSpawnEnv(),
  },
);
const [code, signal] = await new Promise((done) =>
  child.once("exit", (exitCode, exitSignal) => done([exitCode, exitSignal])),
);
if (signal) throw new Error(`Dev login exited by ${signal}`);
process.exitCode = code ?? 1;
