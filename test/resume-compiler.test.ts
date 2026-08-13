import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../src/resume/compiler-types.js";
import { containsLatinOrDigit } from "../src/resume/pdf-postflight.js";
import { getResumeFixture, RESUME_FIXTURES } from "../src/resume/fixtures.js";

test("resume compiler fixtures preserve stable evidence-linked IDs", () => {
  const structure = getResumeFixture("zh-qualified");
  const bullets = structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets),
  );
  assert.equal(bullets.length, 22);
  assert.equal(new Set(bullets.map((bullet) => bullet.id)).size, bullets.length);
  assert.ok(
    bullets.every((bullet) => (bullet.source_fact_ids?.length ?? 0) > 0),
  );
  assert.ok(
    structure.sections.every(
      (section) =>
        section.id &&
        section.items.every(
          (item) => item.id && item.source_experience_id,
        ),
    ),
  );
});

test("fixture reads are isolated clones", () => {
  const first = getResumeFixture("zh-qualified");
  const second = getResumeFixture("zh-qualified");
  assert.ok(first.contact);
  assert.ok(second.contact);
  first.contact.name = "changed";
  first.sections[0]?.items.splice(0);
  assert.notEqual(second.contact.name, "changed");
  assert.ok((second.sections[0]?.items.length ?? 0) > 0);
  assert.notStrictEqual(first, RESUME_FIXTURES["zh-qualified"]);
});

test("global page gates cannot drift below the product requirements", () => {
  assert.equal(RESUME_GLOBAL_MINIMUM_USAGE_RATIO, 0.92);
  assert.equal(RESUME_LAYOUT_TOLERANCE_PX, 1);
});

test("PDF font classification treats digits as Times New Roman content", () => {
  assert.equal(containsLatinOrDigit("2026"), true);
  assert.equal(containsLatinOrDigit("English"), true);
  assert.equal(containsLatinOrDigit("中文"), false);
});

test("hidden renderer uses real DOM geometry and an isolated Chromium host", async () => {
  const [fontReadiness, bulletMeasurement, markdown, service, saveDialog] = await Promise.all([
    readFile(
      new URL(
        "../src/desktop/renderer/src/resume-renderer/font-readiness.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/desktop/renderer/src/resume-renderer/bullet-measurement.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/desktop/renderer/src/resume-renderer/safe-markdown.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/desktop/main/resume-compiler-service.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/desktop/main/electron-pdf-save-dialog.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(fontReadiness, /document\.fonts\.ready/);
  assert.match(bulletMeasurement, /range\.getClientRects\(\)/);
  assert.match(
    bulletMeasurement,
    /lastLineRatio \+ Number\.EPSILON >= gateRatio/,
  );
  assert.match(markdown, /marked\.parseInline/);
  assert.match(markdown, /element\.removeAttribute/);
  assert.match(service, /show: false/);
  assert.match(service, /nodeIntegration: false/);
  assert.match(service, /contextIsolation: true/);
  assert.match(service, /sandbox: true/);
  assert.match(service, /printToPDF\(\{/);
  assert.match(service, /pageSize: "A4"/);
  assert.match(service, /preferCSSPageSize: true/);
  assert.match(service, /#operationQueue/);
  assert.match(service, /Refusing to print an unqualified resume candidate/);
  assert.match(saveDialog, /showSaveDialog/);
  assert.match(saveDialog, /showOverwriteConfirmation/);
  assert.match(saveDialog, /extensions: \["pdf"\]/);
});
