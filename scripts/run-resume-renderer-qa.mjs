import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import electron from "electron";

const artifactDirectory =
  process.env.COOLTO_RESUME_QA_ARTIFACT_DIR ??
  (await mkdtemp(join(tmpdir(), "coolto-resume-renderer-qa-")));
const resultPath = join(artifactDirectory, "result.json");
const pdfPath = join(artifactDirectory, "qualified.pdf");
const screenshotPath = join(artifactDirectory, "qualified.png");
const fixtureIds = [
  "zh-qualified",
  "zh-qualified",
  "en-qualified",
  "mixed-qualified",
  "markdown-qualified",
  "underfilled",
  "tail-failure",
  "overflow",
];

await new Promise((resolve, reject) => {
  const child = spawn(electron, ["."], {
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      COOLTO_RESUME_QA: "1",
      COOLTO_RESUME_QA_QUIET: "1",
      COOLTO_RESUME_QA_FIXTURES: fixtureIds.join(","),
      COOLTO_RESUME_QA_RESULT_PATH: resultPath,
      COOLTO_RESUME_QA_PDF_PATH: pdfPath,
      COOLTO_RESUME_QA_SCREENSHOT_PATH: screenshotPath,
      COOLTO_RESUME_QA_PDF_FIXTURE: "markdown-qualified",
    },
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Electron QA exited with code ${code}, signal ${signal}`));
  });
});

const report = JSON.parse(await readFile(resultPath, "utf8"));
const results = report.compileResults;
assert.equal(results.length, fixtureIds.length);

const firstQualified = results[0];
const repeatedQualified = results[1];
assert.equal(firstQualified.fixtureId, "zh-qualified");
assert.equal(firstQualified.qualified, true);
assert.equal(firstQualified.pageCount, 1);
assert.equal(firstQualified.overflowPx, 0);
assert.ok(firstQualified.usageRatio >= 0.85);
assert.ok(firstQualified.usageRatio <= 0.98);
assert.ok(firstQualified.bullets.length > 0);
assert.ok(firstQualified.bullets.every((bullet) => bullet.passed));
assert.deepEqual(repeatedQualified, firstQualified);

const byId = new Map(results.slice(2).map((result) => [result.fixtureId, result]));
assert.deepEqual(byId.get("en-qualified").loadedFontFamilies, ["Times New Roman"]);
assert.deepEqual(byId.get("mixed-qualified").loadedFontFamilies, [
  "SimSun",
  "Times New Roman",
]);
assert.equal(byId.get("markdown-qualified").qualified, true);
assert.ok(
  byId
    .get("underfilled")
    .violations.some((violation) => violation.code === "page_underfilled"),
);
assert.ok(
  byId
    .get("tail-failure")
    .violations.some(
      (violation) =>
        violation.code === "bullet_tail_too_short" &&
        violation.bulletId === "tail-short",
    ),
);
assert.ok(
  byId
    .get("overflow")
    .violations.some((violation) => violation.code === "page_overflow"),
);
assert.ok(byId.get("overflow").pageCount > 1);

const [concurrentQualified, concurrentTail] = report.concurrentCompileResults;
assert.equal(concurrentQualified.fixtureId, "concurrent-qualified");
assert.equal(concurrentQualified.qualified, true);
assert.equal(concurrentTail.fixtureId, "concurrent-tail");
assert.equal(concurrentTail.qualified, false);
assert.ok(
  concurrentTail.violations.some(
    (violation) => violation.code === "bullet_tail_too_short",
  ),
);

assert.equal(report.pdfCompileResult.qualified, true);
assert.equal(report.postflight.valid, true);
assert.equal(report.postflight.pageCount, 1);
assert.equal(report.postflight.isA4Portrait, true);
assert.equal(report.postflight.hasTextLayer, true);
assert.equal(report.postflight.hasSimSun, true);
assert.equal(report.postflight.hasTimesNewRoman, true);
assert.doesNotMatch(report.postflight.extractedText, /\*\*|__/);

assert.equal(report.workspaceResult.preparedStatus, "writing");
assert.equal(report.workspaceResult.finalStatus, "layout_qualified");
assert.equal(report.workspaceResult.revision, 1);
assert.ok(report.workspaceResult.bindingCount > 0);
assert.equal(report.workspaceResult.compileResult.qualified, true);
assert.ok(report.workspaceResult.compileResult.usageRatio >= 0.85);
assert.ok(report.workspaceResult.compileResult.bullets.every((bullet) => bullet.passed));

process.stdout.write(
  `${JSON.stringify({
    passed: true,
    usageRatio: firstQualified.usageRatio,
    minimumBulletTailRatio: Math.min(
      ...firstQualified.bullets.map((bullet) => bullet.lastLineRatio),
    ),
    workspaceUsageRatio: report.workspaceResult.compileResult.usageRatio,
    workspaceBindingCount: report.workspaceResult.bindingCount,
    artifactDirectory,
    resultPath,
    pdfPath,
    screenshotPath,
  }, null, 2)}\n`,
);
