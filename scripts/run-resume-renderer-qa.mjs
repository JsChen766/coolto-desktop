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
const pdfPageImageBase = join(artifactDirectory, "qualified-pdf-page");
const pdfPageScreenshotPath = `${pdfPageImageBase}.png`;
const g6PdfPath = join(artifactDirectory, "g6-export.pdf");
const qaUserDataPath = join(artifactDirectory, "user-data");
const fixtureIds = [
  "education-details-qualified",
  "education-details-qualified",
  "body-scale-probe",
  "en-qualified",
  "mixed-qualified",
  "markdown-qualified",
  "long-contact-qualified",
  "additional-content-qualified",
  "underfilled",
  "tail-failure",
  "overflow",
];

await new Promise((resolve, reject) => {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [".", `--user-data-dir=${qaUserDataPath}`], {
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...childEnv,
      COOLTO_RESUME_QA: "1",
      COOLTO_RESUME_QA_QUIET: "1",
      COOLTO_RESUME_QA_FIXTURES: fixtureIds.join(","),
      COOLTO_RESUME_QA_RESULT_PATH: resultPath,
      COOLTO_RESUME_QA_PDF_PATH: pdfPath,
      COOLTO_RESUME_QA_SCREENSHOT_PATH: screenshotPath,
      COOLTO_RESUME_QA_PDF_FIXTURE: "education-details-qualified",
      COOLTO_RESUME_G6_EXPORT_PATH: g6PdfPath,
    },
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Electron QA exited with code ${code}, signal ${signal}`));
  });
});

const report = JSON.parse(await readFile(resultPath, "utf8"));
await renderPdfFirstPage(pdfPath, pdfPageImageBase);
assert.ok((await readFile(pdfPageScreenshotPath)).byteLength > 0);
const results = report.compileResults;
assert.equal(results.length, fixtureIds.length);

const firstQualified = results[0];
const repeatedQualified = results[1];
assert.equal(firstQualified.fixtureId, "education-details-qualified");
assert.equal(firstQualified.qualified, true);
assert.equal(firstQualified.pageCount, 1);
assert.equal(firstQualified.overflowPx, 0);
assert.ok(firstQualified.usageRatio >= 0.85);
assert.ok(firstQualified.usageRatio <= 0.98);
assert.ok(firstQualified.bullets.length > 0);
assert.ok(firstQualified.bullets.every((bullet) => bullet.passed));
assert.ok(firstQualified.bullets.every((bullet) =>
  bullet.tailPolicyVersion === "resume-tail-v2" &&
  bullet.ceuPx > 0 && bullet.noWrapTextWidthPx > 0 &&
  bullet.tailProbe?.styleSignature &&
  ["low", "medium", "high"].includes(bullet.tailProbe.wrapRisk)
));
assertObservationTimestamp(firstQualified.observedAt);
assertObservationTimestamp(repeatedQualified.observedAt);
assert.deepEqual(withoutObservationTime(repeatedQualified), withoutObservationTime(firstQualified));

const byId = new Map(results.slice(2).map((result) => [result.fixtureId, result]));
const scaled = byId.get("body-scale-probe");
assert.ok(scaled.bodyFontSizePx > firstQualified.bodyFontSizePx);
assert.ok(scaled.bullets[0].ceuPx > firstQualified.bullets[0].ceuPx);
assert.deepEqual(byId.get("en-qualified").loadedFontFamilies, ["Times New Roman"]);
assert.deepEqual(byId.get("mixed-qualified").loadedFontFamilies, [
  "SimSun",
  "Times New Roman",
]);
assert.equal(byId.get("markdown-qualified").qualified, true);
assert.equal(byId.get("long-contact-qualified").qualified, true);
assert.equal(byId.get("long-contact-qualified").overflowPx, 0);
assert.equal(byId.get("additional-content-qualified").qualified, true);
assert.ok(
  byId
    .get("underfilled")
    .violations.some((violation) => violation.code === "page_underfilled"),
);
const failedTail = byId.get("tail-failure").bullets.find(
  (bullet) => bullet.bulletId === "tail-short",
);
assert.ok(failedTail);
assert.ok(failedTail.lastLineWidthPx + 1 <
  failedTail.availableLineWidthPx * (2 / 3));
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
assert.match(report.postflight.extractedText, /GPA\s*3\.8\s*\/\s*4\.0/u);
assert.match(report.postflight.extractedText, /专业前\s*10\s*%/u);
assert.match(report.postflight.extractedText, /主修课程[：:]\s*数据结构/u);

assert.equal(report.workspaceResult.preparedStatus, "writing");
assert.equal(report.workspaceResult.g3Status, "layout_qualified");
assert.equal(report.workspaceResult.duplicateStatus, "layout_qualified");
assert.equal(report.workspaceResult.reviewStatus, "needs_revision");
assert.equal(report.workspaceResult.finalStatus, "ready_for_approval");
assert.equal(report.workspaceResult.revision, 3);
assert.equal(report.workspaceResult.repairRound, 1);
assert.ok(report.workspaceResult.repairDiagnostic.candidatesCompiled >= 1);
assert.ok(report.workspaceResult.bindingCount > 0);
assert.equal(report.workspaceResult.compileResult.qualified, true);
assert.equal(report.workspaceResult.compileResult.bodyFontSizePx, 14);
assert.ok(report.workspaceResult.compileResult.usageRatio >= 0.85);
assert.ok(report.workspaceResult.compileResult.bullets.every((bullet) => bullet.passed));
assert.equal(report.g6ExportResult.status, "exported");
assert.equal(report.g6ExportResult.filePath, g6PdfPath);
assert.equal(report.g6ExportResult.pageCount, 1);
assert.ok(report.g6ExportResult.bytes > 0);
assert.match(report.g6ExportResult.sha256, /^[a-f0-9]{64}$/);

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
    pdfPageScreenshotPath,
    g6PdfPath,
  }, null, 2)}\n`,
);

function assertObservationTimestamp(value) {
  const timestamp = Date.parse(value);
  assert.ok(Number.isFinite(timestamp));
  assert.ok(timestamp <= Date.now());
}

function withoutObservationTime(result) {
  const { observedAt: _observedAt, ...stableLayoutResult } = result;
  return stableLayoutResult;
}

function renderPdfFirstPage(pdf, outputBase) {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftoppm", ["-png", "-f", "1", "-singlefile", pdf, outputBase]);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pdftoppm exited with code ${code}, signal ${signal}`));
    });
  });
}
