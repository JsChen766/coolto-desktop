import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";

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
const child = spawn(electronBinary, [outfile], { cwd: process.cwd(), stdio: "inherit" });
const [code, signal] = await new Promise((done) =>
  child.once("exit", (exitCode, exitSignal) => done([exitCode, exitSignal])),
);
if (signal) throw new Error(`Dev login exited by ${signal}`);
process.exitCode = code ?? 1;
