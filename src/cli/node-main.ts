#!/usr/bin/env node

import { CliSemanticCompiler } from "./semantic-compiler.js";
import { runCli } from "./main.js";

/** Node entry: fast in-process estimator (dev). Use cli:electron for the
 * real Chromium renderer, which is the source of truth for layout gates. */
async function main(): Promise<void> {
  await runCli(new CliSemanticCompiler());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`启动失败：${message}\n`);
  process.exitCode = 1;
});
