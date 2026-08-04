import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BrowserWindow, ipcMain } from "electron";

import { CooltoApiClient } from "../../api/coolto-api-client.js";
import { loadLocalEnv, readConfig } from "../../config.js";
import { ElectronResumeCompilerService } from "./resume-compiler-service.js";
import {
  runPerformanceSession,
} from "./resume-performance-session.js";
import type {
  PerformanceManifest,
  PerformanceRun,
} from "./resume-performance-session.js";

const localApiBaseUrl = "http://127.0.0.1:8080";

export async function runResumePerformanceQa(): Promise<void> {
  loadLocalEnv();
  const config = readConfig();
  if (config.apiBaseUrl !== localApiBaseUrl) {
    throw new Error("Section F QA only permits http://127.0.0.1:8080");
  }
  const [manifest, count, email, password] = await Promise.all([
    readManifest(requiredEnv("COOLTO_RESUME_PERF_MANIFEST_PATH")),
    parseRunCount(process.env.COOLTO_RESUME_PERF_RUNS),
    Promise.resolve(requiredEnv("COOLTO_PERF_EMAIL")),
    Promise.resolve(requiredEnv("COOLTO_PERF_PASSWORD")),
  ]);
  const artifactDirectory = process.env.COOLTO_RESUME_PERF_ARTIFACT_DIR;
  const client = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
  const compiler = new ElectronResumeCompilerService(ipcMain);
  const keepAlive = new BrowserWindow({ show: false });
  await keepAlive.loadURL("about:blank");
  try {
    await client.login({ email, password });
    const runs: PerformanceRun[] = [];
    for (const sample of manifest.samples) {
      for (let iteration = 1; iteration <= count; iteration += 1) {
        const run = await runPerformanceSession(client, compiler, config, manifest, sample, iteration);
        runs.push(run);
        process.stdout.write(`${JSON.stringify(run)}\n`);
        if (artifactDirectory) {
          await writeFile(
            join(artifactDirectory, `run-${sample.id}-${String(iteration).padStart(2, "0")}.json`),
            `${JSON.stringify(run, null, 2)}\n`,
            "utf8",
          );
        }
      }
    }
    await writeResult({ manifest, modelId: config.modelId, runs });
  } finally {
    compiler.dispose();
    keepAlive.destroy();
    await client.logout().catch(() => undefined);
  }
}

async function readManifest(path: string): Promise<PerformanceManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PerformanceManifest;
}

async function writeResult(result: object): Promise<void> {
  await writeFile(
    requiredEnv("COOLTO_RESUME_PERF_RESULT_PATH"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
}

function parseRunCount(value: string | undefined): number {
  const count = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(count) || count < 1 || count > 30) {
    throw new Error("COOLTO_RESUME_PERF_RUNS must be 1–30");
  }
  return count;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
