import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import electron from "electron";

const PERFORMANCE_GATE_MS = 240_000;
const runCount = Number.parseInt(process.env.COOLTO_RESUME_PERF_RUNS ?? "10", 10);
assert.ok(Number.isInteger(runCount) && runCount >= 1 && runCount <= 30);
const artifactDirectory =
  process.env.COOLTO_RESUME_PERF_ARTIFACT_DIR ??
  (await mkdtemp(join(tmpdir(), "coolto-resume-performance-qa-")));
await mkdir(artifactDirectory, { recursive: true });
const resultPath = join(artifactDirectory, "result.json");
const debugPath = join(artifactDirectory, "debug.log");

await new Promise((resolve, reject) => {
  const child = spawn(electron, ["."], {
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      COOLTO_RESUME_PERFORMANCE_QA: "1",
      COOLTO_RESUME_PERF_RUNS: String(runCount),
      COOLTO_RESUME_PERF_MANIFEST_PATH: process.env.COOLTO_RESUME_PERF_MANIFEST_PATH,
      COOLTO_RESUME_PERF_RESULT_PATH: resultPath,
      COOLTO_RESUME_PERF_DEBUG_PATH: debugPath,
      COOLTO_RESUME_PERF_ARTIFACT_DIR: artifactDirectory,
    },
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Electron perf QA exited with code ${code}, signal ${signal}`));
  });
});

const report = JSON.parse(await readFile(resultPath, "utf8"));
const runs = report.runs;
assert.ok(Array.isArray(runs) && runs.length > 0);
for (const run of runs) {
  assert.equal(typeof run.elapsedMs, "number");
  assert.equal(typeof run.modelCallCount, "number");
  assert.equal(typeof run.compileCount, "number");
  assert.equal(typeof run.qualifiedPreviewDelivered, "boolean");
}
const summary = summarize(report);
await writeFile(
  join(artifactDirectory, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.passed) process.exitCode = 1;

function summarize(report) {
  const perSample = {};
  for (const run of report.runs) {
    perSample[run.sampleId] ??= [];
    perSample[run.sampleId].push(run);
  }
  const samples = Object.entries(perSample).map(([sampleId, runs]) => {
    const elapsed = runs.map((run) => run.elapsedMs).sort((a, b) => a - b);
    const modelCalls = runs.map((run) => run.modelCallCount).sort((a, b) => a - b);
    const compiles = runs.map((run) => run.compileCount).sort((a, b) => a - b);
    const failures = runs.filter((run) => run.status !== "ready_for_approval");
    const qualified = runs.filter((run) => run.status === "ready_for_approval");
    const retried = runs.filter((run) => (run.failedToolCount ?? 0) > 0);
    const retryCount = runs.reduce(
      (total, run) => total + (run.failedToolCount ?? 0),
      0,
    );
    const aggregateStage = {};
    const aggregateUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    for (const run of runs) {
      for (const [stage, durationMs] of Object.entries(run.stageDurationsMs ?? {})) {
        aggregateStage[stage] = (aggregateStage[stage] ?? 0) + durationMs;
      }
      aggregateUsage.inputTokens += run.modelUsage?.inputTokens ?? 0;
      aggregateUsage.outputTokens += run.modelUsage?.outputTokens ?? 0;
      aggregateUsage.cacheReadTokens += run.modelUsage?.cacheReadTokens ?? 0;
    }
    return {
      sampleId,
      runCount: runs.length,
      passedCount: runs.length - failures.length,
      failures: failures.map((run) => ({
        iteration: run.iteration,
        status: run.status,
        error: run.error,
      })),
      qualifiedQuality: qualified.map((run) => ({
        iteration: run.iteration,
        elapsedS: Math.round(run.elapsedMs / 1000),
        usageRatio: run.quality?.usageRatio,
        qualityPassed: run.quality?.qualityPassed,
        qualityScore: run.quality?.qualityScore,
        violations: run.quality?.violations.length ?? 0,
        qualityIssues: run.quality?.qualityIssues.length ?? 0,
        bulletCount: run.quality?.bulletCount,
        coverage: run.quality?.requirementCoverage,
      })),
      retriedRuns: retried.map((run) => run.iteration),
      retryCount,
      toolSequences: runs.map((run) => ({ iteration: run.iteration, tools: run.toolSequence })),
      medianMs: median(elapsed),
      p95Ms: percentile(elapsed, 0.95),
      maxMs: elapsed.at(-1),
      minMs: elapsed[0],
      medianModelCalls: median(modelCalls),
      maxModelCalls: modelCalls.at(-1),
      medianCompiles: median(compiles),
      maxCompiles: compiles.at(-1),
      aggregateStageDurationsMs: aggregateStage,
      aggregateModelUsage: aggregateUsage,
      qualifiedPreviewDelivered: runs.every((run) => run.qualifiedPreviewDelivered),
    };
  });
  const allElapsed = runs.map((run) => run.elapsedMs).sort((a, b) => a - b);
  return {
    runLabel: report.runLabel,
    modelId: report.modelId,
    totalRuns: runs.length,
    passed: samples.every(
      (sample) =>
        sample.failures.length === 0 &&
        sample.medianMs <= PERFORMANCE_GATE_MS &&
        sample.p95Ms <= PERFORMANCE_GATE_MS,
    ),
    overallMedianMs: median(allElapsed),
    overallP95Ms: percentile(allElapsed, 0.95),
    overallMaxMs: allElapsed.at(-1),
    samples,
    artifactDirectory,
    resultPath,
    debugPath,
  };
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[Math.max(0, index)];
}
